/**
 * Microsoft Graph sendMail — preferred path for Studio client delivery.
 * Uses the tenant mailbox (info@) so Hotmail/Outlook inherit M365 trust
 * instead of Resend/Amazon SES reputation.
 */

import {
  extractEmailAddress,
  getStudioFromEmail,
  getStudioReplyToEmail,
  type StudioEmailEnvSource,
} from './config';
import type { SendEmailInput, SendEmailResult } from './types';

type TokenCache = {
  accessToken: string;
  expiresAtMs: number;
};

let tokenCache: TokenCache | null = null;

function trim(value: string | undefined | null): string {
  return (value ?? '').trim();
}

export function isMicrosoftGraphConfigured(env?: StudioEmailEnvSource): boolean {
  const resolved = env ?? {};
  return Boolean(
    trim(resolved.MICROSOFT_GRAPH_TENANT_ID) &&
      trim(resolved.MICROSOFT_GRAPH_CLIENT_ID) &&
      trim(resolved.MICROSOFT_GRAPH_CLIENT_SECRET),
  );
}

export function getMicrosoftGraphMailbox(env?: StudioEmailEnvSource): string {
  const resolved = env ?? {};
  const explicit = trim(resolved.MICROSOFT_GRAPH_MAILBOX);
  if (explicit) return explicit.toLowerCase();
  return extractEmailAddress(getStudioFromEmail(resolved as StudioEmailEnvSource));
}

async function getGraphAccessToken(env: StudioEmailEnvSource): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAtMs > now + 60_000) {
    return tokenCache.accessToken;
  }

  const tenant = trim(env.MICROSOFT_GRAPH_TENANT_ID);
  const clientId = trim(env.MICROSOFT_GRAPH_CLIENT_ID);
  const clientSecret = trim(env.MICROSOFT_GRAPH_CLIENT_SECRET);
  if (!tenant || !clientId || !clientSecret) {
    throw new Error('Microsoft Graph is not configured');
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });

  const response = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    },
  );
  const raw = await response.text();
  let parsed: { access_token?: string; expires_in?: number; error?: string } = {};
  try {
    parsed = JSON.parse(raw) as typeof parsed;
  } catch {
    /* non-JSON */
  }
  if (!response.ok || !parsed.access_token) {
    console.error('[studio-email] Graph token error', response.status, raw.slice(0, 300));
    throw new Error(parsed.error || `graph-token-${response.status}`);
  }

  const expiresInSec = typeof parsed.expires_in === 'number' ? parsed.expires_in : 3600;
  tokenCache = {
    accessToken: parsed.access_token,
    expiresAtMs: now + expiresInSec * 1000,
  };
  return parsed.access_token;
}

/** @internal test helper */
export function clearGraphTokenCacheForTests(): void {
  tokenCache = null;
}

function graphRecipients(addresses: string[]): Array<{ emailAddress: { address: string } }> {
  return addresses.map((address) => ({ emailAddress: { address } }));
}

function xOnlyHeaders(headers?: Record<string, string>): Array<{ name: string; value: string }> {
  if (!headers) return [];
  return Object.entries(headers)
    .filter(([name]) => /^x-/i.test(name))
    .map(([name, value]) => ({ name, value: String(value).slice(0, 500) }));
}

export async function sendViaMicrosoftGraph(
  input: SendEmailInput,
  env?: StudioEmailEnvSource,
): Promise<SendEmailResult> {
  const resolved = env ?? {};
  if (!isMicrosoftGraphConfigured(resolved)) {
    return { ok: false, retryable: false, error: 'graph-not-configured' };
  }

  let accessToken: string;
  let mailbox: string;
  try {
    accessToken = await getGraphAccessToken(resolved);
    mailbox = getMicrosoftGraphMailbox(resolved);
  } catch (error) {
    return {
      ok: false,
      retryable: true,
      error: error instanceof Error ? error.message : 'graph-auth',
    };
  }

  const to = input.to.trim().toLowerCase();
  const replyTo = input.replyTo?.trim() || getStudioReplyToEmail(resolved) || undefined;
  const bccList = (Array.isArray(input.bcc) ? input.bcc : input.bcc ? [input.bcc] : [])
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0 && value !== to && value !== mailbox);

  const internetHeaders = xOnlyHeaders(input.headers);
  const message: Record<string, unknown> = {
    subject: input.subject,
    body: {
      contentType: 'HTML',
      content: input.html || input.text.replace(/\n/g, '<br>\n'),
    },
    toRecipients: graphRecipients([to]),
  };
  if (bccList.length) message.bccRecipients = graphRecipients(bccList);
  if (replyTo) message.replyTo = graphRecipients([replyTo.toLowerCase()]);
  if (internetHeaders.length) message.internetMessageHeaders = internetHeaders;
  if (input.attachments?.length) {
    message.attachments = input.attachments.map((file) => ({
      '@odata.type': '#microsoft.graph.fileAttachment',
      name: file.filename,
      contentType: file.contentType || 'application/pdf',
      contentBytes: file.content,
    }));
  }

  const providerMessageId = `graph:${crypto.randomUUID()}`;

  try {
    const response = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/sendMail`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'User-Agent': 'che-xu-studio-worker',
        },
        body: JSON.stringify({
          message,
          saveToSentItems: true,
        }),
      },
    );

    if (response.status === 202 || response.ok) {
      return { ok: true, providerMessageId };
    }

    const raw = await response.text();
    console.error('[studio-email] Graph sendMail error', response.status, raw.slice(0, 400));
    const retryable = response.status === 429 || response.status >= 500;
    let code = `graph-${response.status}`;
    try {
      const parsed = JSON.parse(raw) as { error?: { code?: string; message?: string } };
      code = parsed.error?.code || parsed.error?.message?.slice(0, 80) || code;
    } catch {
      /* ignore */
    }
    return { ok: false, retryable, error: code };
  } catch (error) {
    console.error(
      '[studio-email] Graph network failure',
      error instanceof Error ? error.message : 'unknown',
    );
    return { ok: false, retryable: true, error: 'graph-network' };
  }
}

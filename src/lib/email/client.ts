/**
 * Server-only Resend HTTP client (Workers-compatible fetch).
 * Do not import from client bundles.
 *
 * "sent" means Resend accepted the message — not confirmed inbox delivery.
 */

import {
  getResendApiKey,
  getStudioFromEmail,
  getStudioReplyToEmail,
  type StudioEmailEnvSource,
} from './config';
import type { SendEmailInput, SendEmailResult } from './types';

export async function sendViaResend(
  input: SendEmailInput,
  env?: StudioEmailEnvSource,
): Promise<SendEmailResult> {
  let apiKey: string;
  let from: string;
  try {
    apiKey = getResendApiKey(env);
    from = getStudioFromEmail(env);
  } catch (error) {
    return {
      ok: false,
      retryable: false,
      error: error instanceof Error ? error.message : 'email-config',
    };
  }

  const replyTo = input.replyTo?.trim() || getStudioReplyToEmail(env) || undefined;
  const to = input.to.trim().toLowerCase();
  const bccList = (Array.isArray(input.bcc) ? input.bcc : input.bcc ? [input.bcc] : [])
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0 && value !== to);

  const body: Record<string, unknown> = {
    from,
    to: [to],
    subject: input.subject,
    html: input.html,
    text: input.text,
  };
  if (replyTo) body.reply_to = replyTo;
  if (bccList.length) body.bcc = bccList;
  if (input.headers && Object.keys(input.headers).length > 0) {
    body.headers = input.headers;
  }
  if (input.tags?.length) body.tags = input.tags;
  if (input.attachments?.length) {
    body.attachments = input.attachments.map((file) => ({
      filename: file.filename,
      content: file.content,
      content_type: file.contentType || 'application/pdf',
    }));
  }

  // Note: Resend click/open tracking is domain-level (not a Send Email field).
  // Keep domain click tracking disabled for chexustudio.com so capability URLs
  // are not rewritten. `disableTracking` is retained for call-site intent only.
  void input.disableTracking;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'User-Agent': 'che-xu-studio-worker',
  };
  if (input.idempotencyKey) {
    headers['Idempotency-Key'] = input.idempotencyKey.slice(0, 256);
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const raw = await response.text();
    let parsed: { id?: string; message?: string; name?: string } = {};
    try {
      parsed = JSON.parse(raw) as typeof parsed;
    } catch {
      /* non-JSON */
    }

    if (!response.ok) {
      const retryable = response.status === 429 || response.status >= 500;
      const code = parsed.name || `resend-${response.status}`;
      console.error('[studio-email] Resend error', response.status, code, raw.slice(0, 300));
      return { ok: false, retryable, error: code };
    }

    const providerMessageId = parsed.id?.trim();
    if (!providerMessageId) {
      return { ok: false, retryable: true, error: 'missing-provider-id' };
    }

    return { ok: true, providerMessageId };
  } catch (error) {
    console.error(
      '[studio-email] Network failure',
      error instanceof Error ? error.message : 'unknown',
    );
    return { ok: false, retryable: true, error: 'network' };
  }
}

export function classifyProviderFailure(error: string): { retryable: boolean } {
  const terminal = [
    'invalid-from',
    'email-config',
    'not-configured',
    'validation_error',
    'invalid_access',
    'missing_required_field',
    'invalid_parameter',
  ];
  if (terminal.some((t) => error.toLowerCase().includes(t))) {
    return { retryable: false };
  }
  if (/^resend-4\d\d$/.test(error) && error !== 'resend-429') {
    return { retryable: false };
  }
  return { retryable: true };
}

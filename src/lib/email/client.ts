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

  const body: Record<string, unknown> = {
    from,
    to: [input.to.trim()],
    subject: input.subject,
    html: input.html,
    text: input.text,
  };
  if (replyTo) body.reply_to = replyTo;
  if (input.tags?.length) body.tags = input.tags;
  if (input.attachments?.length) {
    body.attachments = input.attachments.map((file) => ({
      filename: file.filename,
      content: file.content,
      content_type: file.contentType || 'application/pdf',
    }));
  }

  // Privacy: disable click/open tracking for capability-link emails so Resend
  // does not rewrite secure Proposal/Invoice URLs through tracking redirects.
  if (input.disableTracking) {
    body.tracking = { click: false, open: false };
  }

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

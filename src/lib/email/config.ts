/**
 * Studio email configuration — server-only.
 * Reuses CONTACT_FROM_EMAIL when STUDIO_FROM_EMAIL is unset.
 */

export type StudioEmailEnvSource = {
  RESEND_API_KEY?: string;
  CONTACT_FROM_EMAIL?: string;
  CONTACT_NOTIFY_EMAIL?: string;
  STUDIO_FROM_EMAIL?: string;
  STUDIO_REPLY_TO_EMAIL?: string;
  STUDIO_NOTIFY_EMAIL?: string;
  PUBLIC_SITE_URL?: string;
  STUDIO_BASE_URL?: string;
  CRON_SECRET?: string;
};

function trimOrEmpty(value: string | undefined | null): string {
  return (value ?? '').trim();
}

export function resolveStudioEmailEnv(fromWorker?: StudioEmailEnvSource): StudioEmailEnvSource {
  const processEnv =
    typeof process !== 'undefined'
      ? {
          RESEND_API_KEY: process.env.RESEND_API_KEY,
          CONTACT_FROM_EMAIL: process.env.CONTACT_FROM_EMAIL,
          CONTACT_NOTIFY_EMAIL: process.env.CONTACT_NOTIFY_EMAIL,
          STUDIO_FROM_EMAIL: process.env.STUDIO_FROM_EMAIL,
          STUDIO_REPLY_TO_EMAIL: process.env.STUDIO_REPLY_TO_EMAIL,
          STUDIO_NOTIFY_EMAIL: process.env.STUDIO_NOTIFY_EMAIL,
          PUBLIC_SITE_URL: process.env.PUBLIC_SITE_URL,
          STUDIO_BASE_URL: process.env.STUDIO_BASE_URL,
          CRON_SECRET: process.env.CRON_SECRET,
        }
      : {};

  return {
    RESEND_API_KEY:
      fromWorker?.RESEND_API_KEY ??
      (typeof import.meta.env.RESEND_API_KEY === 'string' ? import.meta.env.RESEND_API_KEY : undefined) ??
      processEnv.RESEND_API_KEY,
    CONTACT_FROM_EMAIL:
      fromWorker?.CONTACT_FROM_EMAIL ??
      (typeof import.meta.env.CONTACT_FROM_EMAIL === 'string'
        ? import.meta.env.CONTACT_FROM_EMAIL
        : undefined) ??
      processEnv.CONTACT_FROM_EMAIL,
    CONTACT_NOTIFY_EMAIL:
      fromWorker?.CONTACT_NOTIFY_EMAIL ?? processEnv.CONTACT_NOTIFY_EMAIL,
    STUDIO_FROM_EMAIL: fromWorker?.STUDIO_FROM_EMAIL ?? processEnv.STUDIO_FROM_EMAIL,
    STUDIO_REPLY_TO_EMAIL: fromWorker?.STUDIO_REPLY_TO_EMAIL ?? processEnv.STUDIO_REPLY_TO_EMAIL,
    STUDIO_NOTIFY_EMAIL: fromWorker?.STUDIO_NOTIFY_EMAIL ?? processEnv.STUDIO_NOTIFY_EMAIL,
    PUBLIC_SITE_URL:
      fromWorker?.PUBLIC_SITE_URL ??
      (typeof import.meta.env.PUBLIC_SITE_URL === 'string'
        ? import.meta.env.PUBLIC_SITE_URL
        : undefined) ??
      processEnv.PUBLIC_SITE_URL,
    STUDIO_BASE_URL:
      fromWorker?.STUDIO_BASE_URL ??
      (typeof import.meta.env.STUDIO_BASE_URL === 'string'
        ? import.meta.env.STUDIO_BASE_URL
        : undefined) ??
      processEnv.STUDIO_BASE_URL,
    CRON_SECRET: fromWorker?.CRON_SECRET ?? processEnv.CRON_SECRET,
  };
}

export async function readStudioEmailEnvFromRuntime(): Promise<StudioEmailEnvSource> {
  let fromWorker: StudioEmailEnvSource = {};
  try {
    const worker = await import('cloudflare:workers');
    fromWorker = {
      RESEND_API_KEY: worker.env.RESEND_API_KEY,
      CONTACT_FROM_EMAIL: worker.env.CONTACT_FROM_EMAIL,
      CONTACT_NOTIFY_EMAIL: worker.env.CONTACT_NOTIFY_EMAIL,
      STUDIO_FROM_EMAIL: worker.env.STUDIO_FROM_EMAIL,
      STUDIO_REPLY_TO_EMAIL: worker.env.STUDIO_REPLY_TO_EMAIL,
      STUDIO_NOTIFY_EMAIL: worker.env.STUDIO_NOTIFY_EMAIL,
      PUBLIC_SITE_URL: worker.env.PUBLIC_SITE_URL,
      STUDIO_BASE_URL: worker.env.STUDIO_BASE_URL,
      CRON_SECRET: worker.env.CRON_SECRET,
    };
  } catch {
    // Node / non-worker
  }
  return resolveStudioEmailEnv(fromWorker);
}

export function isResendConfigured(env?: StudioEmailEnvSource): boolean {
  return trimOrEmpty((env ?? resolveStudioEmailEnv()).RESEND_API_KEY).length > 0;
}

export function getResendApiKey(env?: StudioEmailEnvSource): string {
  const key = trimOrEmpty((env ?? resolveStudioEmailEnv()).RESEND_API_KEY);
  if (!key) throw new Error('RESEND_API_KEY is not configured');
  return key;
}

/** Prefer STUDIO_FROM_EMAIL, fall back to CONTACT_FROM_EMAIL. */
export function getStudioFromEmail(env?: StudioEmailEnvSource): string {
  const resolved = env ?? resolveStudioEmailEnv();
  const from =
    trimOrEmpty(resolved.STUDIO_FROM_EMAIL) ||
    trimOrEmpty(resolved.CONTACT_FROM_EMAIL) ||
    'Che Xu Studio <info@chexustudio.com>';
  if (/resend\.dev/i.test(from)) {
    throw new Error('From address must use a verified production domain');
  }
  return from;
}

export function getStudioReplyToEmail(env?: StudioEmailEnvSource): string | null {
  const resolved = env ?? resolveStudioEmailEnv();
  const reply =
    trimOrEmpty(resolved.STUDIO_REPLY_TO_EMAIL) ||
    extractEmailAddress(getStudioFromEmail(resolved));
  return reply || null;
}

export function getStudioNotifyEmail(env?: StudioEmailEnvSource): string | null {
  const resolved = env ?? resolveStudioEmailEnv();
  return (
    trimOrEmpty(resolved.STUDIO_NOTIFY_EMAIL) ||
    trimOrEmpty(resolved.CONTACT_NOTIFY_EMAIL) ||
    null
  );
}

/** Public document base URL — never from untrusted Host header. */
export function getPublicSiteOrigin(env?: StudioEmailEnvSource): string {
  const resolved = env ?? resolveStudioEmailEnv();
  const raw = trimOrEmpty(resolved.PUBLIC_SITE_URL) || 'https://chexustudio.com';
  try {
    return new URL(raw).origin;
  } catch {
    return 'https://chexustudio.com';
  }
}

/** Authenticated Studio admin base URL. */
export function getStudioAdminOrigin(env?: StudioEmailEnvSource): string {
  const resolved = env ?? resolveStudioEmailEnv();
  const raw =
    trimOrEmpty(resolved.STUDIO_BASE_URL) ||
    trimOrEmpty(resolved.PUBLIC_SITE_URL) ||
    'https://studio.chexustudio.com';
  try {
    return new URL(raw).origin;
  } catch {
    return 'https://studio.chexustudio.com';
  }
}

export function extractEmailAddress(fromHeader: string): string {
  const match = fromHeader.match(/<([^>]+)>/);
  if (match?.[1]) return match[1].trim().toLowerCase();
  return fromHeader.trim().toLowerCase();
}

export function sanitizeEmailSubject(value: string, max = 180): string {
  return value.replace(/[\r\n\0]+/g, ' ').trim().slice(0, max);
}

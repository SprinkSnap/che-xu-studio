/**
 * Studio email configuration — server-only.
 * Reuses CONTACT_FROM_EMAIL when STUDIO_FROM_EMAIL is unset.
 *
 * Client Proposal/Invoice delivery prefers Microsoft Graph (M365 mailbox)
 * when configured — Hotmail/Outlook inbox placement is far better than Resend/SES.
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
  /** Entra tenant ID for Graph sendMail. */
  MICROSOFT_GRAPH_TENANT_ID?: string;
  /** Entra app (client) ID. */
  MICROSOFT_GRAPH_CLIENT_ID?: string;
  /** Entra app client secret (server-only). */
  MICROSOFT_GRAPH_CLIENT_SECRET?: string;
  /** Mailbox UPN to send as (defaults to From address). */
  MICROSOFT_GRAPH_MAILBOX?: string;
  /** auto | graph | resend — Studio client delivery transport. */
  STUDIO_EMAIL_TRANSPORT?: string;
};

function trimOrEmpty(value: string | undefined | null): string {
  return (value ?? '').trim();
}

function pick(
  fromWorker: string | undefined,
  fromMeta: string | undefined,
  fromProcess: string | undefined,
): string | undefined {
  return fromWorker ?? fromMeta ?? fromProcess;
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
          MICROSOFT_GRAPH_TENANT_ID: process.env.MICROSOFT_GRAPH_TENANT_ID,
          MICROSOFT_GRAPH_CLIENT_ID: process.env.MICROSOFT_GRAPH_CLIENT_ID,
          MICROSOFT_GRAPH_CLIENT_SECRET: process.env.MICROSOFT_GRAPH_CLIENT_SECRET,
          MICROSOFT_GRAPH_MAILBOX: process.env.MICROSOFT_GRAPH_MAILBOX,
          STUDIO_EMAIL_TRANSPORT: process.env.STUDIO_EMAIL_TRANSPORT,
        }
      : {};

  const meta = (key: keyof StudioEmailEnvSource): string | undefined => {
    try {
      const value = (import.meta.env as Record<string, unknown>)[key];
      return typeof value === 'string' ? value : undefined;
    } catch {
      return undefined;
    }
  };

  return {
    RESEND_API_KEY: pick(fromWorker?.RESEND_API_KEY, meta('RESEND_API_KEY'), processEnv.RESEND_API_KEY),
    CONTACT_FROM_EMAIL: pick(
      fromWorker?.CONTACT_FROM_EMAIL,
      meta('CONTACT_FROM_EMAIL'),
      processEnv.CONTACT_FROM_EMAIL,
    ),
    CONTACT_NOTIFY_EMAIL:
      fromWorker?.CONTACT_NOTIFY_EMAIL ?? processEnv.CONTACT_NOTIFY_EMAIL,
    STUDIO_FROM_EMAIL: fromWorker?.STUDIO_FROM_EMAIL ?? processEnv.STUDIO_FROM_EMAIL,
    STUDIO_REPLY_TO_EMAIL: fromWorker?.STUDIO_REPLY_TO_EMAIL ?? processEnv.STUDIO_REPLY_TO_EMAIL,
    STUDIO_NOTIFY_EMAIL: fromWorker?.STUDIO_NOTIFY_EMAIL ?? processEnv.STUDIO_NOTIFY_EMAIL,
    PUBLIC_SITE_URL: pick(
      fromWorker?.PUBLIC_SITE_URL,
      meta('PUBLIC_SITE_URL'),
      processEnv.PUBLIC_SITE_URL,
    ),
    STUDIO_BASE_URL: pick(
      fromWorker?.STUDIO_BASE_URL,
      meta('STUDIO_BASE_URL'),
      processEnv.STUDIO_BASE_URL,
    ),
    CRON_SECRET: fromWorker?.CRON_SECRET ?? processEnv.CRON_SECRET,
    MICROSOFT_GRAPH_TENANT_ID:
      fromWorker?.MICROSOFT_GRAPH_TENANT_ID ?? processEnv.MICROSOFT_GRAPH_TENANT_ID,
    MICROSOFT_GRAPH_CLIENT_ID:
      fromWorker?.MICROSOFT_GRAPH_CLIENT_ID ?? processEnv.MICROSOFT_GRAPH_CLIENT_ID,
    MICROSOFT_GRAPH_CLIENT_SECRET:
      fromWorker?.MICROSOFT_GRAPH_CLIENT_SECRET ?? processEnv.MICROSOFT_GRAPH_CLIENT_SECRET,
    MICROSOFT_GRAPH_MAILBOX:
      fromWorker?.MICROSOFT_GRAPH_MAILBOX ?? processEnv.MICROSOFT_GRAPH_MAILBOX,
    STUDIO_EMAIL_TRANSPORT:
      fromWorker?.STUDIO_EMAIL_TRANSPORT ?? processEnv.STUDIO_EMAIL_TRANSPORT,
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
      MICROSOFT_GRAPH_TENANT_ID: worker.env.MICROSOFT_GRAPH_TENANT_ID,
      MICROSOFT_GRAPH_CLIENT_ID: worker.env.MICROSOFT_GRAPH_CLIENT_ID,
      MICROSOFT_GRAPH_CLIENT_SECRET: worker.env.MICROSOFT_GRAPH_CLIENT_SECRET,
      MICROSOFT_GRAPH_MAILBOX: worker.env.MICROSOFT_GRAPH_MAILBOX,
      STUDIO_EMAIL_TRANSPORT: worker.env.STUDIO_EMAIL_TRANSPORT,
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

/**
 * BCC target for client-facing Proposal/Invoice delivery copies.
 * Prefer explicit notify addresses; otherwise the From mailbox.
 */
export function getStudioDeliveryBcc(env?: StudioEmailEnvSource): string | null {
  const resolved = env ?? resolveStudioEmailEnv();
  const notify = getStudioNotifyEmail(resolved);
  if (notify) return notify.toLowerCase();
  try {
    return extractEmailAddress(getStudioFromEmail(resolved));
  } catch {
    return null;
  }
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

export type StudioEmailTransport = 'graph' | 'resend';

/**
 * Resolve transport for Studio client-facing mail (proposal/invoice/reminders).
 * Graph preferred when configured — required for Hotmail Inbox reliability.
 */
export function resolveStudioEmailTransport(
  env?: StudioEmailEnvSource,
): StudioEmailTransport {
  const resolved = env ?? resolveStudioEmailEnv();
  const forced = trimOrEmpty(resolved.STUDIO_EMAIL_TRANSPORT).toLowerCase();
  if (forced === 'resend') return 'resend';
  if (forced === 'graph') return 'graph';
  const hasGraph =
    trimOrEmpty(resolved.MICROSOFT_GRAPH_TENANT_ID) &&
    trimOrEmpty(resolved.MICROSOFT_GRAPH_CLIENT_ID) &&
    trimOrEmpty(resolved.MICROSOFT_GRAPH_CLIENT_SECRET);
  return hasGraph ? 'graph' : 'resend';
}

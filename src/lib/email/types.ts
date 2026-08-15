/**
 * Email domain types — Phase 12.
 */

export type StudioEmailType =
  | 'proposal_sent'
  | 'proposal_accepted'
  | 'proposal_changes_requested'
  | 'deposit_invoice'
  | 'final_invoice'
  | 'payment_received'
  | 'payment_reminder';

export type EmailDeliveryStatus =
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'bounced'
  | 'failed'
  | 'complained';

export type OutboxStatus =
  | 'pending'
  | 'processing'
  | 'sent'
  | 'failed'
  | 'canceled'
  | 'skipped';

export type RenderedEmail = {
  subject: string;
  html: string;
  text: string;
};

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string | null;
  /** Resend idempotency key (defense in depth). */
  idempotencyKey?: string;
  /** Disable Resend click/open tracking for capability-link emails. */
  disableTracking?: boolean;
  tags?: Array<{ name: string; value: string }>;
  /**
   * Optional PDF attachments fetched at send time.
   * Never persist attachment bytes in email_outbox / Postgres.
   */
  attachments?: EmailAttachment[];
};

export type EmailAttachment = {
  filename: string;
  /** Base64 content for Resend — ephemeral in memory only. */
  content: string;
  contentType?: string;
};

export type SendEmailResult =
  | { ok: true; providerMessageId: string }
  | { ok: false; retryable: boolean; error: string };

export type OutboxEnqueueInput = {
  emailType: StudioEmailType;
  recipientEmail: string;
  resourceType: string;
  resourceId: string;
  idempotencyKey: string;
  clientId?: string | null;
  projectId?: string | null;
  proposalId?: string | null;
  invoiceId?: string | null;
  paymentId?: string | null;
  /** Safe metadata only — never raw capability tokens. */
  payload?: Record<string, unknown>;
};

export const DEFAULT_OUTBOX_BATCH = 20;
export const DEFAULT_REMINDER_BATCH = 50;
export const MAX_ACTIVE_INVOICE_LINKS = 12;
export const MAX_ACTIVE_PROPOSAL_LINKS = 8;

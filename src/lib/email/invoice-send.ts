/**
 * Invoice delivery — Send Invoice action.
 * Invoice becomes Sent only after Resend accepts the message.
 */

import type { StudioSupabaseClient } from '../supabase/types';
import { createInvoicePublicLink, PublicLinkError } from '../public-links/mutations';
import { recordStudioActivity } from '../studio/activity';
import { formatDateOnly } from '../clients/format';
import {
  getPublicSiteOrigin,
  readStudioEmailEnvFromRuntime,
  type StudioEmailEnvSource,
} from './config';
import { sendViaResend } from './client';
import { insertQueuedEmailLog, markEmailLogFailed, markEmailLogSent } from './logging';
import { renderInvoiceDeliveryEmail } from './templates';

export class InvoiceSendError extends Error {
  readonly code: 'not_found' | 'invalid' | 'provider' | 'failed';

  constructor(code: InvoiceSendError['code'], message: string) {
    super(message);
    this.name = 'InvoiceSendError';
    this.code = code;
  }
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 320;
}

export async function sendInvoiceEmail(
  supabase: StudioSupabaseClient,
  input: {
    invoiceId: string;
    actorProfileId: string;
    recipientEmail?: string | null;
    emailEnv?: StudioEmailEnvSource;
  },
): Promise<{ alreadySent: boolean; emailLogId: string }> {
  const emailEnv = input.emailEnv ?? (await readStudioEmailEnvFromRuntime());
  const siteOrigin = getPublicSiteOrigin(emailEnv);

  const { data: invoice, error } = await supabase
    .from('invoices')
    .select(
      `id, status, invoice_number, invoice_type, currency, total_minor, balance_due_minor,
       due_date, sent_at, voided_at, client_id, project_id,
       client_contact_name, client_contact_email, project_name`,
    )
    .eq('id', input.invoiceId)
    .maybeSingle();
  if (error || !invoice) {
    throw new InvoiceSendError('not_found', 'Invoice not found.');
  }
  if (invoice.status === 'draft') {
    throw new InvoiceSendError('invalid', 'Issue the invoice before sending.');
  }
  if (invoice.status === 'void' || invoice.voided_at) {
    throw new InvoiceSendError('invalid', 'Void invoices cannot be sent.');
  }
  if (invoice.status === 'paid' && invoice.balance_due_minor <= 0) {
    throw new InvoiceSendError(
      'invalid',
      'Paid invoices are not sent as payment-due messages. Use a status link if needed.',
    );
  }
  if (invoice.balance_due_minor <= 0) {
    throw new InvoiceSendError('invalid', 'Invoice has no balance due.');
  }

  const recipient = (
    input.recipientEmail?.trim() ||
    invoice.client_contact_email ||
    ''
  )
    .trim()
    .toLowerCase();
  if (!recipient || !isValidEmail(recipient)) {
    throw new InvoiceSendError('invalid', 'A valid recipient email is required.');
  }

  const emailType =
    invoice.invoice_type === 'deposit'
      ? 'deposit_invoice'
      : invoice.invoice_type === 'final'
        ? 'final_invoice'
        : 'deposit_invoice'; // schema has no generic invoice_sent — use deposit_invoice for manual

  // For manual/adjustment use deposit_invoice type as closest transactional delivery enum
  // (schema email_type does not include invoice_sent). Documented in architecture.

  const idempotencyKey = `invoice:${invoice.id}:delivery`;
  const log = await insertQueuedEmailLog(supabase, {
    emailType,
    recipientEmail: recipient,
    subject: `Invoice ${invoice.invoice_number} from Che Xu Studio`,
    idempotencyKey,
    clientId: invoice.client_id,
    projectId: invoice.project_id,
    invoiceId: invoice.id,
  });

  if (!log.created && (log.status === 'sent' || log.status === 'delivered')) {
    return { alreadySent: true, emailLogId: log.id };
  }
  if (invoice.status === 'sent' && invoice.sent_at) {
    return { alreadySent: true, emailLogId: log.id };
  }

  let rawUrl: string;
  try {
    const link = await createInvoicePublicLink(supabase, {
      invoiceId: invoice.id,
      actorProfileId: input.actorProfileId,
      siteOrigin,
      mode: 'mint',
    });
    rawUrl = link.rawUrl;
  } catch (err) {
    if (err instanceof PublicLinkError) {
      throw new InvoiceSendError('invalid', err.message);
    }
    throw err;
  }

  const rendered = renderInvoiceDeliveryEmail({
    contactName: invoice.client_contact_name || '',
    invoiceNumber: invoice.invoice_number,
    projectName: invoice.project_name,
    totalMinor: invoice.total_minor,
    balanceDueMinor: invoice.balance_due_minor,
    currency: invoice.currency,
    dueDate: invoice.due_date ? formatDateOnly(invoice.due_date) : null,
    viewUrl: rawUrl,
  });

  await supabase
    .from('email_logs')
    .update({ subject: rendered.subject, recipient_email: recipient })
    .eq('id', log.id);

  const sendResult = await sendViaResend(
    {
      to: recipient,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      idempotencyKey,
      disableTracking: true,
      tags: [
        { name: 'email_type', value: emailType },
        { name: 'invoice_id', value: invoice.id },
      ],
    },
    emailEnv,
  );

  if (!sendResult.ok) {
    await markEmailLogFailed(supabase, log.id, sendResult.error);
    await recordStudioActivity(supabase, {
      actorProfileId: input.actorProfileId,
      action: 'invoice.email_failed',
      clientId: invoice.client_id,
      projectId: invoice.project_id,
      subjectType: 'invoice',
      subjectId: invoice.id,
      metadata: { email_log_id: log.id, error: sendResult.error },
    });
    throw new InvoiceSendError('provider', 'Unable to send invoice email. Please try again.');
  }

  await markEmailLogSent(supabase, log.id, sendResult.providerMessageId);

  const now = new Date().toISOString();
  if (invoice.status === 'issued') {
    await supabase
      .from('invoices')
      .update({ status: 'sent', sent_at: now })
      .eq('id', invoice.id)
      .eq('status', 'issued');
  } else if (!invoice.sent_at) {
    await supabase.from('invoices').update({ sent_at: now }).eq('id', invoice.id);
  }

  await recordStudioActivity(supabase, {
    actorProfileId: input.actorProfileId,
    action: 'invoice.sent',
    clientId: invoice.client_id,
    projectId: invoice.project_id,
    subjectType: 'invoice',
    subjectId: invoice.id,
    metadata: {
      email_log_id: log.id,
      amount_minor: invoice.balance_due_minor,
      currency: invoice.currency,
    },
  });

  return { alreadySent: false, emailLogId: log.id };
}

export async function resendInvoiceEmail(
  supabase: StudioSupabaseClient,
  input: {
    invoiceId: string;
    actorProfileId: string;
    recipientEmail?: string | null;
    emailEnv?: StudioEmailEnvSource;
  },
): Promise<{ emailLogId: string }> {
  const emailEnv = input.emailEnv ?? (await readStudioEmailEnvFromRuntime());
  const siteOrigin = getPublicSiteOrigin(emailEnv);

  const { data: invoice } = await supabase
    .from('invoices')
    .select(
      `id, status, invoice_number, invoice_type, currency, total_minor, balance_due_minor,
       due_date, voided_at, client_id, project_id, client_contact_name, client_contact_email, project_name`,
    )
    .eq('id', input.invoiceId)
    .maybeSingle();
  if (!invoice) throw new InvoiceSendError('not_found', 'Invoice not found.');
  if (invoice.status === 'draft' || invoice.status === 'void' || invoice.voided_at) {
    throw new InvoiceSendError('invalid', 'This invoice cannot be resent.');
  }
  if (invoice.balance_due_minor <= 0) {
    throw new InvoiceSendError('invalid', 'Invoice has no balance due.');
  }

  const recipient = (
    input.recipientEmail?.trim() ||
    invoice.client_contact_email ||
    ''
  )
    .trim()
    .toLowerCase();
  if (!recipient || !isValidEmail(recipient)) {
    throw new InvoiceSendError('invalid', 'A valid recipient email is required.');
  }

  const emailType =
    invoice.invoice_type === 'final' ? 'final_invoice' : 'deposit_invoice';
  const idempotencyKey = `invoice:${invoice.id}:resend:${Date.now()}`;

  const link = await createInvoicePublicLink(supabase, {
    invoiceId: invoice.id,
    actorProfileId: input.actorProfileId,
    siteOrigin,
    mode: 'mint',
  });

  const rendered = renderInvoiceDeliveryEmail({
    contactName: invoice.client_contact_name || '',
    invoiceNumber: invoice.invoice_number,
    projectName: invoice.project_name,
    totalMinor: invoice.total_minor,
    balanceDueMinor: invoice.balance_due_minor,
    currency: invoice.currency,
    dueDate: invoice.due_date ? formatDateOnly(invoice.due_date) : null,
    viewUrl: link.rawUrl,
  });

  const log = await insertQueuedEmailLog(supabase, {
    emailType,
    recipientEmail: recipient,
    subject: rendered.subject,
    idempotencyKey,
    clientId: invoice.client_id,
    projectId: invoice.project_id,
    invoiceId: invoice.id,
    metadata: { resend: true },
  });

  const sendResult = await sendViaResend(
    {
      to: recipient,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      idempotencyKey,
      disableTracking: true,
    },
    emailEnv,
  );

  if (!sendResult.ok) {
    await markEmailLogFailed(supabase, log.id, sendResult.error);
    throw new InvoiceSendError('provider', 'Unable to resend invoice email.');
  }

  await markEmailLogSent(supabase, log.id, sendResult.providerMessageId);

  if (invoice.status === 'issued') {
    await supabase
      .from('invoices')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', invoice.id)
      .eq('status', 'issued');
  }

  await recordStudioActivity(supabase, {
    actorProfileId: input.actorProfileId,
    action: 'invoice.sent',
    clientId: invoice.client_id,
    projectId: invoice.project_id,
    subjectType: 'invoice',
    subjectId: invoice.id,
    metadata: { email_log_id: log.id, resend: true },
  });

  return { emailLogId: log.id };
}

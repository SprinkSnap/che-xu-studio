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
  getStudioDeliveryBcc,
  readStudioEmailEnvFromRuntime,
  type StudioEmailEnvSource,
} from './config';
import { sendViaResend } from './client';
import { insertQueuedEmailLog, markEmailLogFailed, markEmailLogSent } from './logging';
import { renderInvoiceDeliveryEmail } from './templates';
import { resolveDeliveryRecipient } from './resolve-recipient';
import {
  isMicrosoftConsumerMailbox,
  transactionalDeliveryHeaders,
} from './deliverability';

export class InvoiceSendError extends Error {
  readonly code: 'not_found' | 'invalid' | 'provider' | 'failed';

  constructor(code: InvoiceSendError['code'], message: string) {
    super(message);
    this.name = 'InvoiceSendError';
    this.code = code;
  }
}

export type InvoiceSendResult = {
  alreadySent: boolean;
  emailLogId: string;
  recipientEmail: string;
  providerMessageId?: string | null;
};

function invoiceEmailType(invoiceType: string): 'deposit_invoice' | 'final_invoice' {
  return invoiceType === 'final' ? 'final_invoice' : 'deposit_invoice';
}

/**
 * Idempotency: invoice:{id}:delivery
 * First successful provider acceptance wins for that key.
 * If the first-delivery key already succeeded, Send delegates to Resend so the
 * client still receives a fresh email.
 */
export async function sendInvoiceEmail(
  supabase: StudioSupabaseClient,
  input: {
    invoiceId: string;
    actorProfileId: string;
    recipientEmail?: string | null;
    emailEnv?: StudioEmailEnvSource;
  },
): Promise<InvoiceSendResult> {
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

  const recipient = await resolveDeliveryRecipient(supabase, {
    recipientEmail: input.recipientEmail,
    snapshotEmail: invoice.client_contact_email,
    clientId: invoice.client_id,
  });
  if (!recipient) {
    throw new InvoiceSendError('invalid', 'A valid recipient email is required.');
  }

  const emailType = invoiceEmailType(invoice.invoice_type);
  const idempotencyKey = `invoice:${invoice.id}:delivery`;
  const log = await insertQueuedEmailLog(supabase, {
    emailType,
    recipientEmail: recipient,
    subject: `Your invoice ${invoice.invoice_number} from Che Xu Studio`,
    idempotencyKey,
    clientId: invoice.client_id,
    projectId: invoice.project_id,
    invoiceId: invoice.id,
  });

  if (!log.created && (log.status === 'sent' || log.status === 'delivered')) {
    const resent = await resendInvoiceEmail(supabase, {
      ...input,
      recipientEmail: recipient,
      emailEnv,
    });
    return {
      alreadySent: false,
      emailLogId: resent.emailLogId,
      recipientEmail: resent.recipientEmail,
      providerMessageId: resent.providerMessageId,
    };
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

  let pdfAttachment = null;
  if (!isMicrosoftConsumerMailbox(recipient)) {
    const { maybeInvoicePdfAttachment } = await import('../pdf/attachments');
    const { invoicePdfFilename } = await import('../pdf/filenames');
    pdfAttachment = await maybeInvoicePdfAttachment(supabase, {
      invoiceId: invoice.id,
      filename: invoicePdfFilename(invoice.invoice_number),
    });
  }

  const sendResult = await sendViaResend(
    {
      to: recipient,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      idempotencyKey,
      disableTracking: true,
      bcc: getStudioDeliveryBcc(emailEnv),
      headers: transactionalDeliveryHeaders(`invoice:${invoice.id}`),
      tags: [
        { name: 'email_type', value: emailType },
        { name: 'invoice_id', value: invoice.id },
      ],
      attachments: pdfAttachment ? [pdfAttachment] : undefined,
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
    throw new InvoiceSendError(
      'provider',
      `Unable to send invoice email (${sendResult.error}). Check Email history and Resend.`,
    );
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
      recipient_domain: recipient.split('@')[1] || null,
    },
  });

  return {
    alreadySent: false,
    emailLogId: log.id,
    recipientEmail: recipient,
    providerMessageId: sendResult.providerMessageId,
  };
}

/** Explicit resend — new idempotency key, mints a fresh link. */
export async function resendInvoiceEmail(
  supabase: StudioSupabaseClient,
  input: {
    invoiceId: string;
    actorProfileId: string;
    recipientEmail?: string | null;
    emailEnv?: StudioEmailEnvSource;
  },
): Promise<{ emailLogId: string; recipientEmail: string; providerMessageId: string }> {
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

  const recipient = await resolveDeliveryRecipient(supabase, {
    recipientEmail: input.recipientEmail,
    snapshotEmail: invoice.client_contact_email,
    clientId: invoice.client_id,
  });
  if (!recipient) {
    throw new InvoiceSendError('invalid', 'A valid recipient email is required.');
  }

  const emailType = invoiceEmailType(invoice.invoice_type);
  const idempotencyKey = `invoice:${invoice.id}:resend:${Date.now()}`;

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

  let pdfAttachment = null;
  if (!isMicrosoftConsumerMailbox(recipient)) {
    const { maybeInvoicePdfAttachment } = await import('../pdf/attachments');
    const { invoicePdfFilename } = await import('../pdf/filenames');
    pdfAttachment = await maybeInvoicePdfAttachment(supabase, {
      invoiceId: invoice.id,
      filename: invoicePdfFilename(invoice.invoice_number),
    });
  }

  const sendResult = await sendViaResend(
    {
      to: recipient,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      idempotencyKey,
      disableTracking: true,
      bcc: getStudioDeliveryBcc(emailEnv),
      headers: transactionalDeliveryHeaders(`invoice-resend:${invoice.id}`),
      tags: [
        { name: 'email_type', value: emailType },
        { name: 'invoice_id', value: invoice.id },
      ],
      attachments: pdfAttachment ? [pdfAttachment] : undefined,
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
      metadata: { email_log_id: log.id, error: sendResult.error, resend: true },
    });
    throw new InvoiceSendError(
      'provider',
      `Unable to resend invoice email (${sendResult.error}). Check Email history and Resend.`,
    );
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
    metadata: {
      email_log_id: log.id,
      resend: true,
      recipient_domain: recipient.split('@')[1] || null,
    },
  });

  return {
    emailLogId: log.id,
    recipientEmail: recipient,
    providerMessageId: sendResult.providerMessageId,
  };
}

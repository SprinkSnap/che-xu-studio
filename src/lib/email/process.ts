/**
 * Outbox processor — render + send queued intents.
 * Capability URLs are minted at send time (never stored in payload).
 */

import type { StudioSupabaseServiceClient } from '../supabase/types';
import { createInvoicePublicLink } from '../public-links/mutations';
import { recordStudioActivity } from '../studio/activity';
import { formatMoney, formatStudioDateTime } from '../clients/format';
import type { CurrencyCode } from '../supabase/domain';
import {
  getPublicSiteOrigin,
  getStudioAdminOrigin,
  type StudioEmailEnvSource,
} from './config';
import { sendViaResend, classifyProviderFailure } from './client';
import {
  claimOutboxBatch,
  markOutboxFailed,
  markOutboxSent,
  markOutboxSkipped,
  type OutboxRow,
} from './outbox';
import { insertQueuedEmailLog, markEmailLogFailed, markEmailLogSent } from './logging';
import {
  renderInternalNotificationEmail,
  renderPaymentConfirmationEmail,
} from './templates';
import type { StudioEmailType } from './types';
import { processDueReminders } from '../reminders/scheduler';

function str(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function num(payload: Record<string, unknown>, key: string): number {
  const value = payload[key];
  return typeof value === 'number' ? value : Number(value) || 0;
}

function bool(payload: Record<string, unknown>, key: string): boolean {
  return payload[key] === true;
}

async function processOneOutboxRow(
  service: StudioSupabaseServiceClient,
  row: OutboxRow,
  emailEnv: StudioEmailEnvSource,
): Promise<void> {
  const siteOrigin = getPublicSiteOrigin(emailEnv);
  const adminOrigin = getStudioAdminOrigin(emailEnv);
  const payload = row.payload;
  const emailType = row.email_type as StudioEmailType;

  // Skip client payment confirmation if invoice is no longer relevant
  if (emailType === 'payment_received' && str(payload, 'audience') === 'client') {
    if (row.invoice_id) {
      const { data: invoice } = await service
        .from('invoices')
        .select('id, status, voided_at')
        .eq('id', row.invoice_id)
        .maybeSingle();
      if (!invoice || invoice.status === 'void' || invoice.voided_at) {
        await markOutboxSkipped(service, row.id, 'invoice_void');
        return;
      }
    }
  }

  if (emailType === 'payment_reminder') {
    // Reminder outbox rows are processed via reminder scheduler path.
    await markOutboxSkipped(service, row.id, 'use_reminder_scheduler');
    return;
  }

  let subject = '';
  let html = '';
  let text = '';
  let disableTracking = false;

  if (emailType === 'proposal_accepted') {
    const rendered = renderInternalNotificationEmail({
      title: `Proposal accepted — ${str(payload, 'client_name') || str(payload, 'project_name')}`,
      intro: 'A client accepted a proposal.',
      lines: [
        { label: 'Client', value: str(payload, 'client_name') || '—' },
        { label: 'Project', value: str(payload, 'project_name') || '—' },
        { label: 'Proposal', value: str(payload, 'proposal_number') || '—' },
        ...(str(payload, 'invoice_number')
          ? [
              {
                label: 'Deposit invoice',
                value: `${str(payload, 'invoice_number')} (${formatMoney(num(payload, 'invoice_total_minor'), (str(payload, 'currency') as CurrencyCode) || 'CAD')})`,
              },
            ]
          : []),
      ],
      adminUrl: `${adminOrigin}/admin/proposals/${row.proposal_id || row.resource_id}`,
    });
    subject = rendered.subject;
    html = rendered.html;
    text = rendered.text;
  } else if (emailType === 'proposal_changes_requested') {
    const rendered = renderInternalNotificationEmail({
      title: `Changes requested — ${str(payload, 'client_name') || str(payload, 'project_name')}`,
      intro: 'A client requested proposal changes.',
      lines: [
        { label: 'Client', value: str(payload, 'client_name') || '—' },
        { label: 'Project', value: str(payload, 'project_name') || '—' },
        { label: 'Proposal', value: str(payload, 'proposal_number') || '—' },
        { label: 'Message', value: str(payload, 'message') || '—' },
      ],
      adminUrl: `${adminOrigin}/admin/proposals/${row.proposal_id || row.resource_id}`,
    });
    subject = rendered.subject;
    html = rendered.html;
    text = rendered.text;
  } else if (emailType === 'payment_received' && str(payload, 'audience') === 'studio') {
    const rendered = renderInternalNotificationEmail({
      title: `Payment received — ${str(payload, 'invoice_number')}`,
      intro: 'A Stripe payment was reconciled.',
      lines: [
        { label: 'Invoice', value: str(payload, 'invoice_number') || '—' },
        {
          label: 'Amount',
          value: formatMoney(num(payload, 'amount_minor'), (str(payload, 'currency') as CurrencyCode) || 'CAD'),
        },
        { label: 'Type', value: str(payload, 'invoice_type') || '—' },
        { label: 'Project', value: str(payload, 'project_name') || '—' },
        {
          label: 'Remaining balance',
          value: formatMoney(
            num(payload, 'balance_due_minor'),
            (str(payload, 'currency') as CurrencyCode) || 'CAD',
          ),
        },
        {
          label: 'Workflow',
          value: bool(payload, 'deposit_activated')
            ? 'Deposit activated project'
            : bool(payload, 'final_completed')
              ? 'Final payment completed project'
              : 'No workflow change',
        },
      ],
      adminUrl: `${adminOrigin}/admin/invoices/${row.invoice_id || ''}`,
    });
    subject = rendered.subject;
    html = rendered.html;
    text = rendered.text;
  } else if (emailType === 'payment_received') {
    let invoiceUrl: string | null = null;
    if (row.invoice_id) {
      try {
        const link = await createInvoicePublicLink(service, {
          invoiceId: row.invoice_id,
          actorProfileId: null,
          siteOrigin,
          mode: 'mint',
          allowZeroBalance: true,
        });
        invoiceUrl = link.rawUrl;
        disableTracking = true;
      } catch {
        invoiceUrl = null;
      }
    }
    const rendered = renderPaymentConfirmationEmail({
      contactName: str(payload, 'contact_name'),
      invoiceNumber: str(payload, 'invoice_number'),
      amountMinor: num(payload, 'amount_minor'),
      balanceDueMinor: num(payload, 'balance_due_minor'),
      currency: str(payload, 'currency') || 'CAD',
      paidAtLabel: str(payload, 'paid_at')
        ? formatStudioDateTime(str(payload, 'paid_at'))
        : '—',
      projectName: str(payload, 'project_name') || null,
      paymentMethod: str(payload, 'payment_method') || null,
      invoiceUrl,
      depositActivated: bool(payload, 'deposit_activated'),
      finalCompleted: bool(payload, 'final_completed'),
    });
    subject = rendered.subject;
    html = rendered.html;
    text = rendered.text;
  } else {
    await markOutboxSkipped(service, row.id, `unsupported_type:${emailType}`);
    return;
  }

  const log = await insertQueuedEmailLog(service, {
    emailType,
    recipientEmail: row.recipient_email,
    subject,
    idempotencyKey: row.idempotency_key,
    clientId: row.client_id,
    projectId: row.project_id,
    proposalId: row.proposal_id,
    invoiceId: row.invoice_id,
  });

  if (!log.created && (log.status === 'sent' || log.status === 'delivered')) {
    await markOutboxSent(service, row.id, log.id);
    return;
  }

  const sendResult = await sendViaResend(
    {
      to: row.recipient_email,
      subject,
      html,
      text,
      idempotencyKey: row.idempotency_key,
      disableTracking,
    },
    emailEnv,
  );

  if (!sendResult.ok) {
    await markEmailLogFailed(service, log.id, sendResult.error);
    const { retryable } = classifyProviderFailure(sendResult.error);
    await markOutboxFailed(service, row, sendResult.error, retryable && sendResult.retryable);
    return;
  }

  await markEmailLogSent(service, log.id, sendResult.providerMessageId);
  await markOutboxSent(service, row.id, log.id);

  if (emailType === 'payment_received' && str(payload, 'audience') !== 'studio') {
    await recordStudioActivity(service, {
      actorProfileId: null,
      actorType: 'system',
      action: 'payment.confirmation_sent',
      clientId: row.client_id,
      projectId: row.project_id,
      subjectType: 'payment',
      subjectId: row.payment_id,
      metadata: {
        email_log_id: log.id,
        invoice_id: row.invoice_id,
      },
    });
  }
}

export async function processEmailOutbox(
  service: StudioSupabaseServiceClient,
  emailEnv: StudioEmailEnvSource,
  limit = 20,
): Promise<{ processed: number; sent: number; failed: number }> {
  const batch = await claimOutboxBatch(service, limit);
  let sent = 0;
  let failed = 0;
  for (const row of batch) {
    try {
      const before = row.status;
      await processOneOutboxRow(service, row, emailEnv);
      const { data: after } = await service
        .from('email_outbox')
        .select('status')
        .eq('id', row.id)
        .maybeSingle();
      if (after?.status === 'sent') sent += 1;
      else if (after?.status === 'failed' || after?.status === 'pending') failed += 1;
      void before;
    } catch (error) {
      failed += 1;
      await markOutboxFailed(
        service,
        row,
        error instanceof Error ? error.message : 'processing_error',
        true,
      );
    }
  }
  return { processed: batch.length, sent, failed };
}

export async function processStudioJobs(
  service: StudioSupabaseServiceClient,
  emailEnv: StudioEmailEnvSource,
): Promise<{
  outbox: { processed: number; sent: number; failed: number };
  reminders: { considered: number; sent: number; skipped: number; failed: number };
}> {
  const outbox = await processEmailOutbox(service, emailEnv, 20);
  const reminders = await processDueReminders(service, emailEnv, 50);
  return { outbox, reminders };
}

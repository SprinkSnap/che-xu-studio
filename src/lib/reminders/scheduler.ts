/**
 * Payment reminder scheduler — idempotent daily job.
 */

import type { StudioSupabaseServiceClient } from '../supabase/types';
import { createInvoicePublicLink } from '../public-links/mutations';
import { recordStudioActivity } from '../studio/activity';
import { formatDateOnly, formatMoney } from '../clients/format';
import type { CurrencyCode } from '../supabase/domain';
import {
  getPublicSiteOrigin,
  type StudioEmailEnvSource,
} from '../email/config';
import { sendViaResend, classifyProviderFailure } from '../email/client';
import { insertQueuedEmailLog, markEmailLogFailed, markEmailLogSent } from '../email/logging';
import { renderReminderEmail } from '../email/templates';
import {
  calendarDateInTimeZone,
  isInvoiceReminderEligible,
  reminderTypesForInvoiceDay,
  type ReminderSettings,
  type ReminderKind,
} from './dates';

async function loadReminderSettings(
  service: StudioSupabaseServiceClient,
): Promise<ReminderSettings> {
  const { data } = await service
    .from('settings')
    .select(
      'reminders_enabled, business_timezone, reminder_before_due_days, reminder_due_day_enabled, reminder_overdue_days',
    )
    .limit(1)
    .maybeSingle();

  return {
    remindersEnabled: data?.reminders_enabled ?? true,
    businessTimezone: data?.business_timezone || 'America/Toronto',
    beforeDueDays: data?.reminder_before_due_days ?? 3,
    dueDayEnabled: data?.reminder_due_day_enabled ?? true,
    overdueDays: Array.isArray(data?.reminder_overdue_days)
      ? (data!.reminder_overdue_days as number[])
      : [3, 7],
  };
}

function reminderEmailKind(
  type: ReminderKind,
): 'before_due' | 'due_today' | 'overdue' {
  if (type === 'before_due') return 'before_due';
  if (type === 'due_today') return 'due_today';
  return 'overdue';
}

export async function processDueReminders(
  service: StudioSupabaseServiceClient,
  emailEnv: StudioEmailEnvSource,
  limit = 50,
): Promise<{ considered: number; sent: number; skipped: number; failed: number }> {
  const settings = await loadReminderSettings(service);
  if (!settings.remindersEnabled) {
    return { considered: 0, sent: 0, skipped: 0, failed: 0 };
  }

  const businessToday = calendarDateInTimeZone(new Date(), settings.businessTimezone);
  const siteOrigin = getPublicSiteOrigin(emailEnv);

  // Candidate invoices: open balances with due dates
  const { data: invoices, error } = await service
    .from('invoices')
    .select(
      `id, status, invoice_number, currency, balance_due_minor, due_date, voided_at,
       payment_reminders_enabled, client_id, project_id,
       client_contact_name, client_contact_email, project_name`,
    )
    .gt('balance_due_minor', 0)
    .not('due_date', 'is', null)
    .neq('status', 'draft')
    .neq('status', 'void')
    .neq('status', 'paid')
    .eq('payment_reminders_enabled', true)
    .order('due_date', { ascending: true })
    .limit(500);

  if (error) throw error;

  let considered = 0;
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  let processed = 0;

  for (const invoice of invoices ?? []) {
    if (processed >= limit) break;
    if (!isInvoiceReminderEligible(invoice)) continue;

    const dueDate = invoice.due_date!;
    const kinds = reminderTypesForInvoiceDay({
      dueDate,
      businessToday,
      settings,
    });
    if (!kinds.length) continue;

    for (const kind of kinds) {
      if (processed >= limit) break;
      considered += 1;

      // Reserve reminder event (unique invoice_id, reminder_type, scheduled_for)
      const scheduledFor = `${kind.scheduledForDate}T12:00:00.000Z`;
      const { data: reserved, error: reserveError } = await service
        .from('reminder_events')
        .insert({
          invoice_id: invoice.id,
          reminder_type: kind.type,
          scheduled_for: scheduledFor,
          status: 'scheduled',
        })
        .select('id, status')
        .single();

      if (reserveError || !reserved) {
        // Already exists — skip duplicate
        skipped += 1;
        continue;
      }

      processed += 1;

      // Re-check invoice state before send (payment race)
      const { data: fresh } = await service
        .from('invoices')
        .select(
          'id, status, balance_due_minor, voided_at, payment_reminders_enabled, due_date, client_contact_email, client_contact_name, project_name, invoice_number, currency, client_id, project_id',
        )
        .eq('id', invoice.id)
        .maybeSingle();

      if (!fresh || !isInvoiceReminderEligible(fresh)) {
        await service
          .from('reminder_events')
          .update({ status: 'skipped' })
          .eq('id', reserved.id);
        skipped += 1;
        continue;
      }

      const recipient = (fresh.client_contact_email || '').trim().toLowerCase();
      if (!recipient) {
        await service
          .from('reminder_events')
          .update({ status: 'failed' })
          .eq('id', reserved.id);
        failed += 1;
        continue;
      }

      let viewUrl: string;
      try {
        const link = await createInvoicePublicLink(service, {
          invoiceId: fresh.id,
          actorProfileId: null,
          siteOrigin,
          mode: 'mint',
        });
        viewUrl = link.rawUrl;
      } catch {
        await service
          .from('reminder_events')
          .update({ status: 'failed' })
          .eq('id', reserved.id);
        failed += 1;
        continue;
      }

      const days =
        kind.type === 'before_due'
          ? settings.beforeDueDays
          : kind.type.startsWith('overdue')
            ? Number.parseInt(kind.type.replace('overdue_', '').replace('_days', ''), 10) || null
            : null;

      const rendered = renderReminderEmail({
        kind: reminderEmailKind(kind.type),
        contactName: fresh.client_contact_name || '',
        invoiceNumber: fresh.invoice_number,
        balanceDueMinor: fresh.balance_due_minor,
        currency: fresh.currency,
        dueDate: fresh.due_date ? formatDateOnly(fresh.due_date) : null,
        projectName: fresh.project_name,
        days,
        viewUrl,
      });

      const idempotencyKey = `reminder:${fresh.id}:${kind.type}:${kind.scheduledForDate}`;
      const log = await insertQueuedEmailLog(service, {
        emailType: 'payment_reminder',
        recipientEmail: recipient,
        subject: rendered.subject,
        idempotencyKey,
        clientId: fresh.client_id,
        projectId: fresh.project_id,
        invoiceId: fresh.id,
        metadata: { reminder_type: kind.type },
      });

      if (!log.created && (log.status === 'sent' || log.status === 'delivered')) {
        await service
          .from('reminder_events')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            email_log_id: log.id,
          })
          .eq('id', reserved.id);
        sent += 1;
        continue;
      }

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
        await markEmailLogFailed(service, log.id, sendResult.error);
        await service
          .from('reminder_events')
          .update({ status: 'failed', email_log_id: log.id })
          .eq('id', reserved.id);
        failed += 1;
        void classifyProviderFailure;
        await recordStudioActivity(service, {
          actorProfileId: null,
          actorType: 'system',
          action: 'invoice.reminder_failed',
          clientId: fresh.client_id,
          projectId: fresh.project_id,
          subjectType: 'invoice',
          subjectId: fresh.id,
          metadata: {
            reminder_type: kind.type,
            error: sendResult.error,
            amount_minor: fresh.balance_due_minor,
            currency: fresh.currency,
          },
        });
        continue;
      }

      await markEmailLogSent(service, log.id, sendResult.providerMessageId);
      await service
        .from('reminder_events')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          email_log_id: log.id,
        })
        .eq('id', reserved.id);

      await recordStudioActivity(service, {
        actorProfileId: null,
        actorType: 'system',
        action: 'invoice.reminder_sent',
        clientId: fresh.client_id,
        projectId: fresh.project_id,
        subjectType: 'invoice',
        subjectId: fresh.id,
        metadata: {
          reminder_type: kind.type,
          email_log_id: log.id,
          amount_minor: fresh.balance_due_minor,
          currency: fresh.currency,
          balance_label: formatMoney(
            fresh.balance_due_minor,
            fresh.currency as CurrencyCode,
          ),
        },
      });
      sent += 1;
    }
  }

  return { considered, sent, skipped, failed };
}

/**
 * Reminder timezone/date helpers — business-local day boundaries.
 */

export type ReminderSettings = {
  remindersEnabled: boolean;
  businessTimezone: string;
  beforeDueDays: number;
  dueDayEnabled: boolean;
  overdueDays: number[];
};

/** Format a Date as YYYY-MM-DD in the given IANA timezone. */
export function calendarDateInTimeZone(date: Date, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const y = parts.find((p) => p.type === 'year')?.value;
    const m = parts.find((p) => p.type === 'month')?.value;
    const d = parts.find((p) => p.type === 'day')?.value;
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch {
    /* fall through */
  }
  return date.toISOString().slice(0, 10);
}

/** Add whole calendar days to an ISO date (YYYY-MM-DD). */
export function addCalendarDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map((p) => Number.parseInt(p, 10));
  const utc = Date.UTC(y, m - 1, d + days);
  const date = new Date(utc);
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function diffCalendarDays(fromIso: string, toIso: string): number {
  const [y1, m1, d1] = fromIso.split('-').map((p) => Number.parseInt(p, 10));
  const [y2, m2, d2] = toIso.split('-').map((p) => Number.parseInt(p, 10));
  const a = Date.UTC(y1, m1 - 1, d1);
  const b = Date.UTC(y2, m2 - 1, d2);
  return Math.round((b - a) / 86_400_000);
}

export type ReminderKind = 'before_due' | 'due_today' | 'overdue_3_days' | 'overdue_7_days' | 'custom';

/**
 * Determine which reminder types are due for an invoice on businessToday
 * given dueDate (date-only) and settings.
 */
export function reminderTypesForInvoiceDay(input: {
  dueDate: string;
  businessToday: string;
  settings: ReminderSettings;
}): Array<{ type: ReminderKind; scheduledForDate: string }> {
  if (!input.settings.remindersEnabled) return [];
  const results: Array<{ type: ReminderKind; scheduledForDate: string }> = [];
  const daysUntilDue = diffCalendarDays(input.businessToday, input.dueDate);

  if (
    input.settings.beforeDueDays > 0 &&
    daysUntilDue === input.settings.beforeDueDays
  ) {
    results.push({ type: 'before_due', scheduledForDate: input.businessToday });
  }

  if (input.settings.dueDayEnabled && daysUntilDue === 0) {
    results.push({ type: 'due_today', scheduledForDate: input.businessToday });
  }

  const daysOverdue = diffCalendarDays(input.dueDate, input.businessToday);
  for (const offset of input.settings.overdueDays) {
    if (offset > 0 && daysOverdue === offset) {
      const type: ReminderKind =
        offset === 3 ? 'overdue_3_days' : offset === 7 ? 'overdue_7_days' : 'custom';
      results.push({ type, scheduledForDate: input.businessToday });
    }
  }

  return results;
}

export function isInvoiceReminderEligible(invoice: {
  status: string;
  balance_due_minor: number;
  voided_at?: string | null;
  payment_reminders_enabled?: boolean | null;
  due_date: string | null;
}): boolean {
  if (invoice.payment_reminders_enabled === false) return false;
  if (!invoice.due_date) return false;
  if (invoice.voided_at) return false;
  if (invoice.balance_due_minor <= 0) return false;
  if (invoice.status === 'draft' || invoice.status === 'void' || invoice.status === 'paid') {
    return false;
  }
  if (invoice.status === 'refunded' && invoice.balance_due_minor <= 0) return false;
  return ['issued', 'sent', 'partially_paid', 'overdue', 'refunded'].includes(invoice.status);
}

/**
 * Studio settings reads/updates (reminder schedule, timezone).
 */

import type { StudioSupabaseClient } from '../supabase/types';

export type StudioSettingsRow = {
  id: string;
  studio_name: string;
  reminders_enabled: boolean;
  business_timezone: string;
  reminder_before_due_days: number;
  reminder_due_day_enabled: boolean;
  reminder_overdue_days: number[];
  payment_terms_days: number;
  default_currency: 'CAD' | 'USD';
  contact_email: string | null;
  billing_email: string | null;
};

export async function getStudioSettings(
  client: StudioSupabaseClient,
): Promise<StudioSettingsRow | null> {
  const { data, error } = await client
    .from('settings')
    .select(
      `id, studio_name, reminders_enabled, business_timezone, reminder_before_due_days,
       reminder_due_day_enabled, reminder_overdue_days, payment_terms_days, default_currency,
       contact_email, billing_email`,
    )
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return {
    ...data,
    reminder_overdue_days: Array.isArray(data.reminder_overdue_days)
      ? (data.reminder_overdue_days as number[])
      : [3, 7],
  };
}

export async function updateReminderSettings(
  client: StudioSupabaseClient,
  input: {
    remindersEnabled: boolean;
    businessTimezone: string;
    beforeDueDays: number;
    dueDayEnabled: boolean;
    overdueDays: number[];
  },
): Promise<void> {
  const timezone = input.businessTimezone.trim();
  if (!timezone) throw new Error('Business timezone is required.');
  if (input.beforeDueDays < 0 || input.beforeDueDays > 30) {
    throw new Error('Before-due days must be between 0 and 30.');
  }
  const overdue = [...new Set(input.overdueDays.filter((d) => Number.isInteger(d) && d > 0))].sort(
    (a, b) => a - b,
  );
  if (overdue.length === 0) {
    throw new Error('Provide at least one overdue day offset.');
  }

  const existing = await getStudioSettings(client);
  if (!existing) throw new Error('Settings row not found.');

  const { error } = await client
    .from('settings')
    .update({
      reminders_enabled: input.remindersEnabled,
      business_timezone: timezone,
      reminder_before_due_days: input.beforeDueDays,
      reminder_due_day_enabled: input.dueDayEnabled,
      reminder_overdue_days: overdue,
    })
    .eq('id', existing.id);

  if (error) throw error;
}

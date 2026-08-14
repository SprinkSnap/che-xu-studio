import { formatMinorUnits, type CurrencyCode } from '../supabase/domain';

/** Display money from integer minor units. */
export function formatMoney(
  amountMinor: number,
  currency: CurrencyCode = 'CAD',
): string {
  return formatMinorUnits(amountMinor, currency);
}

export function formatStudioDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'America/Toronto',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function formatStudioDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      dateStyle: 'medium',
      timeZone: 'America/Toronto',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function clientDisplayName(client: {
  company_name?: string;
  companyName?: string;
  display_name?: string | null;
  displayName?: string | null;
}): string {
  return (
    client.display_name ||
    client.displayName ||
    client.company_name ||
    client.companyName ||
    'Client'
  );
}

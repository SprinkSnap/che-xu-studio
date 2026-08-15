/**
 * Client / studio identity snapshots for invoice presentation.
 */

import type { StudioSupabaseClient } from '../supabase/types';
import type { ClientIdentitySnapshot } from './types';

function formatAddress(parts: Array<string | null | undefined>): string | null {
  const lines = parts.map((p) => (p ?? '').trim()).filter(Boolean);
  return lines.length ? lines.join('\n') : null;
}

export async function buildClientIdentitySnapshot(
  supabase: StudioSupabaseClient,
  input: { clientId: string; projectId?: string | null },
): Promise<ClientIdentitySnapshot> {
  const [{ data: client }, { data: primary }, { data: project }, { data: settings }] =
    await Promise.all([
      supabase
        .from('clients')
        .select(
          'company_name, display_name, billing_email, billing_address_line1, billing_address_line2, billing_city, billing_region, billing_postal_code, billing_country',
        )
        .eq('id', input.clientId)
        .maybeSingle(),
      supabase
        .from('client_contacts')
        .select('name, email')
        .eq('client_id', input.clientId)
        .eq('is_primary', true)
        .maybeSingle(),
      input.projectId
        ? supabase.from('projects').select('name').eq('id', input.projectId).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from('settings')
        .select(
          'studio_name, legal_name, billing_email, contact_email, address_line1, address_line2, city, region, postal_code, country',
        )
        .limit(1)
        .maybeSingle(),
    ]);

  if (!client) {
    throw new Error('Client not found for snapshot');
  }

  const clientBillingAddress = formatAddress([
    client.billing_address_line1,
    client.billing_address_line2,
    [client.billing_city, client.billing_region, client.billing_postal_code]
      .filter(Boolean)
      .join(', ') || null,
    client.billing_country,
  ]);

  const studioAddress = settings
    ? formatAddress([
        settings.address_line1,
        settings.address_line2,
        [settings.city, settings.region, settings.postal_code].filter(Boolean).join(', ') || null,
        settings.country,
      ])
    : null;

  return {
    clientDisplayName: client.display_name || client.company_name,
    clientContactName: primary?.name ?? null,
    clientContactEmail: primary?.email ?? client.billing_email ?? null,
    clientBillingAddress,
    projectName: project?.name ?? null,
    studioBusinessName: settings?.legal_name || settings?.studio_name || 'Che Xu Studio',
    studioBillingEmail: settings?.billing_email || settings?.contact_email || null,
    studioBusinessAddress: studioAddress,
  };
}

export function snapshotColumns(snapshot: ClientIdentitySnapshot) {
  return {
    client_display_name: snapshot.clientDisplayName,
    client_contact_name: snapshot.clientContactName,
    client_contact_email: snapshot.clientContactEmail,
    client_billing_address: snapshot.clientBillingAddress,
    project_name: snapshot.projectName,
    studio_business_name: snapshot.studioBusinessName,
    studio_billing_email: snapshot.studioBillingEmail,
    studio_business_address: snapshot.studioBusinessAddress,
  };
}

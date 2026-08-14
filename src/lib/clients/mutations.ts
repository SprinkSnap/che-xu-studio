/**
 * Client mutations — user-scoped Supabase + allowlisted fields.
 * Never mass-assign request objects into updates.
 */

import type { StudioSupabaseClient } from '../supabase/types';
import { StudioAuthError } from '../supabase/types';
import { recordStudioActivity } from '../studio/activity';
import type {
  ContactWriteInput,
  CreateClientInput,
  ClientWriteInput,
} from './validation';
import { CLIENT_CONFLICT_ERROR, resolveCompanyAddress } from './validation';
import type { ClientContactRow, ClientRow } from './types';

export class ClientMutationError extends Error {
  readonly code: 'conflict' | 'not_found' | 'forbidden' | 'failed';

  constructor(code: ClientMutationError['code'], message: string) {
    super(message);
    this.name = 'ClientMutationError';
    this.code = code;
  }
}

function mapClientWriteFields(input: ClientWriteInput | CreateClientInput) {
  const resolved = resolveCompanyAddress(input);
  return {
    company_name: resolved.companyName,
    display_name: resolved.displayName,
    billing_email: resolved.billingEmail,
    phone: resolved.phone,
    billing_address_line1: resolved.billingAddressLine1,
    billing_address_line2: resolved.billingAddressLine2,
    billing_city: resolved.billingCity,
    billing_region: resolved.billingRegion,
    billing_postal_code: resolved.billingPostalCode,
    billing_country: resolved.billingCountry,
    company_address_line1: resolved.companyAddressLine1,
    company_address_line2: resolved.companyAddressLine2,
    company_city: resolved.companyCity,
    company_region: resolved.companyRegion,
    company_postal_code: resolved.companyPostalCode,
    company_country: resolved.companyCountry,
    notes: resolved.notes,
  };
}

export async function createClientWithPrimaryContact(
  supabase: StudioSupabaseClient,
  input: CreateClientInput,
  actorProfileId: string | null,
): Promise<string> {
  const fields = mapClientWriteFields(input);

  const { data, error } = await supabase.rpc('create_client_with_primary_contact', {
    p_company_name: fields.company_name,
    p_contact_name: input.contactName,
    p_display_name: fields.display_name,
    p_billing_email: fields.billing_email,
    p_phone: fields.phone,
    p_billing_address_line1: fields.billing_address_line1,
    p_billing_address_line2: fields.billing_address_line2,
    p_billing_city: fields.billing_city,
    p_billing_region: fields.billing_region,
    p_billing_postal_code: fields.billing_postal_code,
    p_billing_country: fields.billing_country,
    p_company_address_line1: fields.company_address_line1,
    p_company_address_line2: fields.company_address_line2,
    p_company_city: fields.company_city,
    p_company_region: fields.company_region,
    p_company_postal_code: fields.company_postal_code,
    p_company_country: fields.company_country,
    p_notes: fields.notes,
    p_contact_email: input.contactEmail,
    p_contact_phone: input.contactPhone,
    p_contact_job_title: input.contactJobTitle,
  });

  if (error || !data) {
    throw new ClientMutationError('failed', 'Unable to create client.');
  }

  const clientId = data as string;
  await recordStudioActivity(supabase, {
    actorProfileId,
    action: 'client.created',
    clientId,
    subjectType: 'client',
    subjectId: clientId,
    metadata: { fields: ['company_name', 'primary_contact'] },
  });

  return clientId;
}

export async function updateClient(
  supabase: StudioSupabaseClient,
  clientId: string,
  input: ClientWriteInput,
  actorProfileId: string | null,
): Promise<ClientRow> {
  const { data: existing, error: loadError } = await supabase
    .from('clients')
    .select('id, updated_at')
    .eq('id', clientId)
    .maybeSingle();

  if (loadError) throw new ClientMutationError('failed', 'Unable to save client.');
  if (!existing) throw new ClientMutationError('not_found', 'Client not found.');

  if (
    input.expectedUpdatedAt &&
    existing.updated_at &&
    existing.updated_at !== input.expectedUpdatedAt
  ) {
    throw new ClientMutationError('conflict', CLIENT_CONFLICT_ERROR);
  }

  const fields = mapClientWriteFields(input);
  const { data, error } = await supabase
    .from('clients')
    .update(fields)
    .eq('id', clientId)
    .select('*')
    .maybeSingle();

  if (error || !data) {
    throw new ClientMutationError('failed', 'Unable to save client.');
  }

  await recordStudioActivity(supabase, {
    actorProfileId,
    action: 'client.updated',
    clientId,
    subjectType: 'client',
    subjectId: clientId,
    metadata: {
      fields: Object.keys(fields),
    },
  });

  return data;
}

export async function archiveClient(
  supabase: StudioSupabaseClient,
  clientId: string,
  actorProfileId: string | null,
): Promise<void> {
  const { data, error } = await supabase
    .from('clients')
    .update({
      status: 'archived',
      archived_at: new Date().toISOString(),
    })
    .eq('id', clientId)
    .eq('status', 'active')
    .select('id')
    .maybeSingle();

  if (error) throw new ClientMutationError('failed', 'Unable to archive client.');
  if (!data) throw new ClientMutationError('not_found', 'Client not found.');

  await recordStudioActivity(supabase, {
    actorProfileId,
    action: 'client.archived',
    clientId,
    subjectType: 'client',
    subjectId: clientId,
  });
}

export async function restoreClient(
  supabase: StudioSupabaseClient,
  clientId: string,
  actorProfileId: string | null,
): Promise<void> {
  const { data, error } = await supabase
    .from('clients')
    .update({
      status: 'active',
      archived_at: null,
    })
    .eq('id', clientId)
    .eq('status', 'archived')
    .select('id')
    .maybeSingle();

  if (error) throw new ClientMutationError('failed', 'Unable to restore client.');
  if (!data) throw new ClientMutationError('not_found', 'Client not found.');

  await recordStudioActivity(supabase, {
    actorProfileId,
    action: 'client.restored',
    clientId,
    subjectType: 'client',
    subjectId: clientId,
  });
}

export async function addClientContact(
  supabase: StudioSupabaseClient,
  clientId: string,
  input: ContactWriteInput,
  actorProfileId: string | null,
): Promise<ClientContactRow> {
  const { data, error } = await supabase
    .from('client_contacts')
    .insert({
      client_id: clientId,
      name: input.name,
      email: input.email,
      phone: input.phone,
      job_title: input.jobTitle,
      is_primary: false,
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new ClientMutationError('failed', 'Unable to add contact.');
  }

  if (input.setPrimary) {
    await setPrimaryContact(supabase, clientId, data.id, actorProfileId);
    data.is_primary = true;
  }

  await recordStudioActivity(supabase, {
    actorProfileId,
    action: 'client.contact_added',
    clientId,
    subjectType: 'client_contact',
    subjectId: data.id,
  });

  return data;
}

export async function updateClientContact(
  supabase: StudioSupabaseClient,
  clientId: string,
  contactId: string,
  input: ContactWriteInput,
  actorProfileId: string | null,
): Promise<ClientContactRow> {
  const { data, error } = await supabase
    .from('client_contacts')
    .update({
      name: input.name,
      email: input.email,
      phone: input.phone,
      job_title: input.jobTitle,
    })
    .eq('id', contactId)
    .eq('client_id', clientId)
    .select('*')
    .maybeSingle();

  if (error) throw new ClientMutationError('failed', 'Unable to update contact.');
  if (!data) throw new ClientMutationError('not_found', 'That contact is no longer available.');

  if (input.setPrimary && !data.is_primary) {
    await setPrimaryContact(supabase, clientId, contactId, actorProfileId);
    data.is_primary = true;
  }

  await recordStudioActivity(supabase, {
    actorProfileId,
    action: 'client.contact_updated',
    clientId,
    subjectType: 'client_contact',
    subjectId: contactId,
    metadata: { fields: ['name', 'email', 'phone', 'job_title'] },
  });

  return data;
}

export async function setPrimaryContact(
  supabase: StudioSupabaseClient,
  clientId: string,
  contactId: string,
  actorProfileId: string | null,
): Promise<void> {
  const { error } = await supabase.rpc('set_primary_client_contact', {
    p_client_id: clientId,
    p_contact_id: contactId,
  });

  if (error) {
    throw new ClientMutationError('failed', 'Unable to set primary contact.');
  }

  await recordStudioActivity(supabase, {
    actorProfileId,
    action: 'client.primary_contact_changed',
    clientId,
    subjectType: 'client_contact',
    subjectId: contactId,
  });
}

export async function removeClientContact(
  supabase: StudioSupabaseClient,
  clientId: string,
  contactId: string,
  actorProfileId: string | null,
): Promise<void> {
  const { data: contact, error: loadError } = await supabase
    .from('client_contacts')
    .select('id, is_primary')
    .eq('id', contactId)
    .eq('client_id', clientId)
    .maybeSingle();

  if (loadError) throw new ClientMutationError('failed', 'Unable to remove contact.');
  if (!contact) throw new ClientMutationError('not_found', 'That contact is no longer available.');

  if (contact.is_primary) {
    const { count, error: countError } = await supabase
      .from('client_contacts')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', clientId);

    if (countError) throw new ClientMutationError('failed', 'Unable to remove contact.');
    if ((count ?? 0) > 1) {
      throw new ClientMutationError(
        'failed',
        'Set another primary contact before removing the current primary.',
      );
    }
  }

  const { error } = await supabase
    .from('client_contacts')
    .delete()
    .eq('id', contactId)
    .eq('client_id', clientId);

  if (error) {
    // Staff may lack DELETE (admin-only RLS). Surface a clear message.
    if (error.code === '42501' || /policy|permission|rls/i.test(error.message)) {
      throw new ClientMutationError(
        'forbidden',
        'You do not have permission to remove contacts.',
      );
    }
    throw new ClientMutationError('failed', 'Unable to remove contact.');
  }

  await recordStudioActivity(supabase, {
    actorProfileId,
    action: 'client.contact_removed',
    clientId,
    subjectType: 'client_contact',
    subjectId: contactId,
  });
}

export function toStudioAuthError(error: unknown): StudioAuthError | null {
  if (error instanceof StudioAuthError) return error;
  return null;
}

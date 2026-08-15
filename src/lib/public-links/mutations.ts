/**
 * Admin + privileged public-link mutations.
 */

import type { StudioSupabaseClient, StudioSupabaseServiceClient } from '../supabase/types';
import { recordStudioActivity } from '../studio/activity';
import { generateSecureToken, hashPublicToken } from './tokens';
import type { PublicLinkRow } from './types';

export class PublicLinkError extends Error {
  readonly code: 'not_found' | 'invalid' | 'forbidden' | 'conflict' | 'failed';

  constructor(code: PublicLinkError['code'], message: string) {
    super(message);
    this.name = 'PublicLinkError';
    this.code = code;
  }
}

type AnyClient = StudioSupabaseClient | StudioSupabaseServiceClient;

export async function createProposalPublicLink(
  supabase: StudioSupabaseClient,
  input: {
    proposalId: string;
    proposalVersionId: string;
    actorProfileId: string | null;
    siteOrigin: string;
  },
): Promise<{ linkId: string; rawUrl: string; expiresAt: string | null }> {
  const { data: proposal, error: proposalError } = await supabase
    .from('proposals')
    .select('id, status, expires_at, current_version_id')
    .eq('id', input.proposalId)
    .maybeSingle();
  if (proposalError || !proposal) {
    throw new PublicLinkError('not_found', 'Proposal not found.');
  }
  if (proposal.status === 'archived') {
    throw new PublicLinkError('invalid', 'Archived proposals cannot receive client links.');
  }

  const { data: version, error: versionError } = await supabase
    .from('proposal_versions')
    .select('id, proposal_id, is_immutable, version_number')
    .eq('id', input.proposalVersionId)
    .eq('proposal_id', input.proposalId)
    .maybeSingle();
  if (versionError || !version) {
    throw new PublicLinkError('not_found', 'Proposal version not found.');
  }
  if (!version.is_immutable) {
    throw new PublicLinkError(
      'invalid',
      'Finalize the proposal version before creating a client link.',
    );
  }

  // Revoke any existing active link for this version (replacement semantics).
  const { data: existingActive } = await supabase
    .from('public_links')
    .select('id')
    .eq('resource_type', 'proposal')
    .eq('proposal_version_id', version.id)
    .is('revoked_at', null);

  if (existingActive?.length) {
    await supabase
      .from('public_links')
      .update({ revoked_at: new Date().toISOString() })
      .eq('proposal_version_id', version.id)
      .is('revoked_at', null);

    for (const row of existingActive) {
      await recordStudioActivity(supabase, {
        actorProfileId: input.actorProfileId,
        action: 'proposal.public_link_revoked',
        subjectType: 'proposal',
        subjectId: input.proposalId,
        metadata: {
          public_link_id: row.id,
          proposal_version_id: version.id,
          reason: 'replaced',
        },
      });
    }
  }

  const rawToken = generateSecureToken();
  const tokenHash = await hashPublicToken(rawToken);
  const expiresAt = proposal.expires_at;

  const { data: link, error } = await supabase
    .from('public_links')
    .insert({
      resource_type: 'proposal',
      resource_id: input.proposalId,
      proposal_version_id: version.id,
      token_hash: tokenHash,
      expires_at: expiresAt,
      created_by: input.actorProfileId,
    })
    .select('id, expires_at')
    .single();

  if (error || !link) {
    throw new PublicLinkError('failed', 'Unable to create client link.');
  }

  await recordStudioActivity(supabase, {
    actorProfileId: input.actorProfileId,
    action: 'proposal.public_link_created',
    subjectType: 'proposal',
    subjectId: input.proposalId,
    metadata: {
      public_link_id: link.id,
      proposal_version_id: version.id,
      version_number: version.version_number,
    },
  });

  // Raw token returned once for URL construction — never persisted.
  const rawUrl = `${input.siteOrigin.replace(/\/$/, '')}/proposal/${rawToken}`;
  return { linkId: link.id, rawUrl, expiresAt: link.expires_at };
}

export async function revokeProposalPublicLink(
  supabase: StudioSupabaseClient,
  input: {
    proposalId: string;
    linkId: string;
    actorProfileId: string | null;
  },
): Promise<void> {
  const { data: link, error } = await supabase
    .from('public_links')
    .select('id, resource_id, revoked_at, proposal_version_id')
    .eq('id', input.linkId)
    .eq('resource_type', 'proposal')
    .eq('resource_id', input.proposalId)
    .maybeSingle();
  if (error || !link) {
    throw new PublicLinkError('not_found', 'Client link not found.');
  }
  if (link.revoked_at) return;

  const { error: updateError } = await supabase
    .from('public_links')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', link.id)
    .is('revoked_at', null);
  if (updateError) {
    throw new PublicLinkError('failed', 'Unable to revoke client link.');
  }

  await recordStudioActivity(supabase, {
    actorProfileId: input.actorProfileId,
    action: 'proposal.public_link_revoked',
    subjectType: 'proposal',
    subjectId: input.proposalId,
    metadata: {
      public_link_id: link.id,
      proposal_version_id: link.proposal_version_id,
    },
  });
}

export async function listProposalPublicLinks(
  supabase: StudioSupabaseClient,
  proposalId: string,
): Promise<PublicLinkRow[]> {
  const { data, error } = await supabase
    .from('public_links')
    .select('*')
    .eq('resource_type', 'proposal')
    .eq('resource_id', proposalId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as PublicLinkRow[];
}

export async function createInvoicePublicLink(
  supabase: StudioSupabaseClient,
  input: {
    invoiceId: string;
    actorProfileId: string | null;
    siteOrigin: string;
  },
): Promise<{ linkId: string; rawUrl: string; expiresAt: string | null }> {
  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .select('id, status, balance_due_minor, voided_at')
    .eq('id', input.invoiceId)
    .maybeSingle();
  if (invoiceError || !invoice) {
    throw new PublicLinkError('not_found', 'Invoice not found.');
  }
  if (invoice.status === 'draft') {
    throw new PublicLinkError('invalid', 'Draft invoices cannot receive payment links.');
  }
  if (invoice.status === 'void' || invoice.voided_at) {
    throw new PublicLinkError('invalid', 'Void invoices cannot receive payment links.');
  }
  if (invoice.balance_due_minor <= 0 && invoice.status === 'paid') {
    throw new PublicLinkError('invalid', 'Paid invoices with zero balance do not need payment links.');
  }
  // Allow creating a view/receipt link for paid invoices? Spec: must have positive balance for Create Payment Link.
  if (invoice.balance_due_minor <= 0) {
    throw new PublicLinkError('invalid', 'Invoice must have a positive balance to create a payment link.');
  }

  const { data: existingActive } = await supabase
    .from('public_links')
    .select('id')
    .eq('resource_type', 'invoice')
    .eq('resource_id', input.invoiceId)
    .is('revoked_at', null);

  if (existingActive?.length) {
    await supabase
      .from('public_links')
      .update({ revoked_at: new Date().toISOString() })
      .eq('resource_type', 'invoice')
      .eq('resource_id', input.invoiceId)
      .is('revoked_at', null);

    for (const row of existingActive) {
      await recordStudioActivity(supabase, {
        actorProfileId: input.actorProfileId,
        action: 'invoice.public_link_revoked',
        subjectType: 'invoice',
        subjectId: input.invoiceId,
        metadata: {
          public_link_id: row.id,
          reason: 'replaced',
        },
      });
    }
  }

  const rawToken = generateSecureToken();
  const tokenHash = await hashPublicToken(rawToken);

  const { data: link, error } = await supabase
    .from('public_links')
    .insert({
      resource_type: 'invoice',
      resource_id: input.invoiceId,
      token_hash: tokenHash,
      created_by: input.actorProfileId,
    })
    .select('id, expires_at')
    .single();

  if (error || !link) {
    throw new PublicLinkError('failed', 'Unable to create invoice payment link.');
  }

  await recordStudioActivity(supabase, {
    actorProfileId: input.actorProfileId,
    action: 'invoice.public_link_created',
    subjectType: 'invoice',
    subjectId: input.invoiceId,
    metadata: {
      public_link_id: link.id,
    },
  });

  const rawUrl = `${input.siteOrigin.replace(/\/$/, '')}/invoice/${rawToken}`;
  return { linkId: link.id, rawUrl, expiresAt: link.expires_at };
}

export async function revokeInvoicePublicLink(
  supabase: StudioSupabaseClient,
  input: {
    invoiceId: string;
    linkId: string;
    actorProfileId: string | null;
  },
): Promise<void> {
  const { data: link, error } = await supabase
    .from('public_links')
    .select('id, resource_id, revoked_at')
    .eq('id', input.linkId)
    .eq('resource_type', 'invoice')
    .eq('resource_id', input.invoiceId)
    .maybeSingle();
  if (error || !link) {
    throw new PublicLinkError('not_found', 'Invoice link not found.');
  }
  if (link.revoked_at) return;

  const { error: updateError } = await supabase
    .from('public_links')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', link.id)
    .is('revoked_at', null);
  if (updateError) {
    throw new PublicLinkError('failed', 'Unable to revoke invoice link.');
  }

  await recordStudioActivity(supabase, {
    actorProfileId: input.actorProfileId,
    action: 'invoice.public_link_revoked',
    subjectType: 'invoice',
    subjectId: input.invoiceId,
    metadata: {
      public_link_id: link.id,
    },
  });
}

export async function listInvoicePublicLinks(
  supabase: StudioSupabaseClient,
  invoiceId: string,
): Promise<PublicLinkRow[]> {
  const { data, error } = await supabase
    .from('public_links')
    .select('*')
    .eq('resource_type', 'invoice')
    .eq('resource_id', invoiceId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as PublicLinkRow[];
}

export async function touchPublicLinkAccess(
  supabase: AnyClient,
  linkId: string,
  isFirstView: boolean,
): Promise<void> {
  const now = new Date().toISOString();
  const patch: { last_accessed_at: string; first_viewed_at?: string } = {
    last_accessed_at: now,
  };
  if (isFirstView) patch.first_viewed_at = now;

  let builder = supabase.from('public_links').update(patch).eq('id', linkId);
  if (isFirstView) {
    builder = builder.is('first_viewed_at', null);
  }
  await builder;
}

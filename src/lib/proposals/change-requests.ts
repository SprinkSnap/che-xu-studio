/**
 * Public proposal change requests — preserve immutable version; admin revises later.
 */

import type { StudioSupabaseServiceClient } from '../supabase/types';
import { recordStudioActivity } from '../studio/activity';
import {
  canRequestChangesResolvedProposal,
  resolveProposalPublicLink,
} from '../public-links/resolve';

export class ChangeRequestError extends Error {
  readonly code: 'unavailable' | 'invalid' | 'expired' | 'failed';

  constructor(code: ChangeRequestError['code'], message: string) {
    super(message);
    this.name = 'ChangeRequestError';
    this.code = code;
  }
}

export type RequestChangesInput = {
  rawToken: string;
  requestedByName: string;
  requestedByEmail: string;
  message: string;
};

export type RequestChangesResult = {
  changeRequestId: string;
  proposalId: string;
  proposalVersionId: string;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function requestProposalChangesViaPublicLink(
  service: StudioSupabaseServiceClient,
  input: RequestChangesInput,
): Promise<RequestChangesResult> {
  const name = input.requestedByName.trim();
  const email = normalizeEmail(input.requestedByEmail);
  const message = input.message.trim();

  if (!name || name.length > 200) {
    throw new ChangeRequestError('invalid', 'Enter your name.');
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) {
    throw new ChangeRequestError('invalid', 'Enter a valid email address.');
  }
  if (!message || message.length < 10) {
    throw new ChangeRequestError('invalid', 'Describe the changes you need (at least 10 characters).');
  }
  if (message.length > 5000) {
    throw new ChangeRequestError('invalid', 'Keep your message under 5000 characters.');
  }

  const resolved = await resolveProposalPublicLink(service, input.rawToken);
  if (!resolved.ok) {
    throw new ChangeRequestError('unavailable', 'This proposal link is no longer available.');
  }
  const document = resolved.document;

  if (!canRequestChangesResolvedProposal(document)) {
    if (document.acceptance || document.proposal.status === 'accepted') {
      throw new ChangeRequestError(
        'invalid',
        'This proposal has already been accepted. Contact Che Xu Studio for revisions.',
      );
    }
    throw new ChangeRequestError(
      'expired',
      'This proposal has expired. Please contact Che Xu Studio for an updated proposal.',
    );
  }

  const { data: row, error } = await service
    .from('proposal_change_requests')
    .insert({
      proposal_id: document.proposal.id,
      proposal_version_id: document.version.id,
      client_id: document.proposal.client_id,
      requested_by_name: name,
      requested_by_email: email,
      message,
    })
    .select('id')
    .single();

  if (error || !row) {
    throw new ChangeRequestError('failed', 'Unable to submit change request.');
  }

  await service
    .from('proposals')
    .update({ status: 'changes_requested' })
    .eq('id', document.proposal.id)
    .neq('status', 'accepted');

  await recordStudioActivity(service, {
    actorProfileId: null,
    action: 'proposal.changes_requested',
    clientId: document.proposal.client_id,
    projectId: document.proposal.project_id,
    subjectType: 'proposal',
    subjectId: document.proposal.id,
    metadata: {
      proposal_version_id: document.version.id,
      version_number: document.version.version_number,
      change_request_id: row.id,
    },
  });

  return {
    changeRequestId: row.id,
    proposalId: document.proposal.id,
    proposalVersionId: document.version.id,
  };
}

export async function listChangeRequestsForProposal(
  service: StudioSupabaseServiceClient | import('../supabase/types').StudioSupabaseClient,
  proposalId: string,
): Promise<
  Array<{
    id: string;
    proposal_version_id: string;
    requested_by_name: string;
    requested_by_email: string;
    message: string;
    created_at: string;
    resolved_at: string | null;
  }>
> {
  const { data, error } = await service
    .from('proposal_change_requests')
    .select(
      'id, proposal_version_id, requested_by_name, requested_by_email, message, created_at, resolved_at',
    )
    .eq('proposal_id', proposalId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/**
 * Public proposal acceptance — idempotent workflow using Phase 9 deposit generation.
 *
 * Recovery model: each step is independently idempotent so retries heal partial success
 * (acceptance row unique per version; deposit getOrCreate; project status noop if already deposit_due).
 */

import type { StudioSupabaseServiceClient } from '../supabase/types';
import { getOrCreateDepositInvoice } from '../invoices/generation';
import { getInvoiceById } from '../invoices/queries';
import { issueInvoice, InvoiceMutationError } from '../invoices/mutations';
import { recordStudioActivity } from '../studio/activity';
import {
  canAcceptResolvedProposal,
  resolveProposalPublicLink,
  type ResolveResult,
} from '../public-links/resolve';
import type { ProposalPublicDocument } from '../public-links/types';

export const ACCEPTANCE_TEXT_VERSION = 'v1';

export class AcceptanceError extends Error {
  readonly code: 'unavailable' | 'invalid' | 'expired' | 'conflict' | 'failed';

  constructor(code: AcceptanceError['code'], message: string) {
    super(message);
    this.name = 'AcceptanceError';
    this.code = code;
  }
}

export type AcceptProposalInput = {
  rawToken: string;
  acceptedByName: string;
  acceptedByEmail: string;
  agreedToTerms: boolean;
  userAgent?: string | null;
};

export type AcceptProposalResult = {
  proposalId: string;
  proposalVersionId: string;
  acceptanceId: string;
  invoiceId: string;
  invoiceNumber: string;
  invoiceTotalMinor: number;
  currency: 'CAD' | 'USD';
  alreadyAccepted: boolean;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function capUserAgent(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().slice(0, 300);
  return trimmed.length ? trimmed : null;
}

async function ensureProjectDepositDue(
  service: StudioSupabaseServiceClient,
  projectId: string,
  clientId: string,
): Promise<void> {
  const { data: project, error } = await service
    .from('projects')
    .select('id, status, client_id')
    .eq('id', projectId)
    .maybeSingle();
  if (error || !project) {
    throw new AcceptanceError('failed', 'Unable to update project status.');
  }

  if (project.status === 'deposit_due') return;

  // Do not regress later operational states.
  if (
    project.status === 'active' ||
    project.status === 'awaiting_final_payment' ||
    project.status === 'completed' ||
    project.status === 'archived'
  ) {
    await recordStudioActivity(service, {
      actorProfileId: null,
      action: 'project.status_changed',
      clientId,
      projectId,
      subjectType: 'project',
      subjectId: projectId,
      metadata: {
        from: project.status,
        to: project.status,
        note: 'proposal_acceptance_skipped_regress',
      },
    });
    return;
  }

  if (project.status !== 'proposal' && project.status !== 'awaiting_approval') {
    return;
  }

  const from = project.status;
  const { data: updated, error: updateError } = await service
    .from('projects')
    .update({ status: 'deposit_due' })
    .eq('id', projectId)
    .eq('status', from)
    .select('id, status')
    .maybeSingle();

  if (updateError) {
    throw new AcceptanceError('failed', 'Unable to update project status.');
  }
  if (!updated) {
    // Concurrent transition — re-check.
    const { data: again } = await service
      .from('projects')
      .select('status')
      .eq('id', projectId)
      .maybeSingle();
    if (again?.status === 'deposit_due') return;
    throw new AcceptanceError('conflict', 'Project status changed during acceptance.');
  }

  await recordStudioActivity(service, {
    actorProfileId: null,
    action: 'project.status_changed',
    clientId,
    projectId,
    subjectType: 'project',
    subjectId: projectId,
    metadata: { from, to: 'deposit_due', reason: 'proposal_accepted' },
  });
}

async function ensureDepositIssued(
  service: StudioSupabaseServiceClient,
  invoiceId: string,
): Promise<{ invoiceNumber: string; totalMinor: number; currency: 'CAD' | 'USD' }> {
  const invoice = await getInvoiceById(service, invoiceId);
  if (!invoice) {
    throw new AcceptanceError('failed', 'Deposit invoice missing after generation.');
  }
  if (invoice.status === 'draft') {
    try {
      await issueInvoice(service, invoiceId, invoice.updated_at, null);
    } catch (error) {
      if (error instanceof InvoiceMutationError && error.code === 'conflict') {
        // Another process issued it — continue.
      } else if (error instanceof InvoiceMutationError && error.code === 'invalid') {
        // Already issued or not draftable — continue if issued.
      } else {
        throw error;
      }
    }
  }
  const fresh = await getInvoiceById(service, invoiceId);
  if (!fresh) {
    throw new AcceptanceError('failed', 'Deposit invoice missing after issue.');
  }
  return {
    invoiceNumber: fresh.invoice_number,
    totalMinor: fresh.total_minor,
    currency: fresh.currency,
  };
}

async function loadDocumentOrThrow(
  service: StudioSupabaseServiceClient,
  rawToken: string,
): Promise<ProposalPublicDocument> {
  const resolved: ResolveResult = await resolveProposalPublicLink(service, rawToken);
  if (!resolved.ok) {
    throw new AcceptanceError('unavailable', 'This proposal link is no longer available.');
  }
  return resolved.document;
}

/**
 * Accept a proposal via secure public link.
 * Idempotent for the exact proposal version.
 */
export async function acceptProposalViaPublicLink(
  service: StudioSupabaseServiceClient,
  input: AcceptProposalInput,
): Promise<AcceptProposalResult> {
  const name = input.acceptedByName.trim();
  const email = normalizeEmail(input.acceptedByEmail);
  if (!name || name.length > 200) {
    throw new AcceptanceError('invalid', 'Enter your name.');
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) {
    throw new AcceptanceError('invalid', 'Enter a valid email address.');
  }
  if (!input.agreedToTerms) {
    throw new AcceptanceError(
      'invalid',
      'Confirm that you agree to the proposal and terms before accepting.',
    );
  }

  const document = await loadDocumentOrThrow(service, input.rawToken);

  // Existing acceptance → complete remaining side effects idempotently.
  const existingAcceptance = document.acceptance;
  if (existingAcceptance || document.proposal.status === 'accepted') {
    const { data: acceptance } = await service
      .from('proposal_acceptances')
      .select('id, proposal_version_id')
      .eq('proposal_version_id', document.version.id)
      .maybeSingle();

    if (!acceptance) {
      throw new AcceptanceError('conflict', 'Proposal is accepted but evidence is missing.');
    }

    const deposit = await getOrCreateDepositInvoice(service, {
      proposalId: document.proposal.id,
      proposalVersionId: document.version.id,
      actorProfileId: null,
    });
    const issued = await ensureDepositIssued(service, deposit.invoiceId);
    await ensureProjectDepositDue(service, document.proposal.project_id, document.proposal.client_id);

    try {
      const { enqueueProposalAcceptedNotification } = await import('../email/notifications');
      await enqueueProposalAcceptedNotification(service, {
        proposalId: document.proposal.id,
        proposalVersionId: document.version.id,
        clientId: document.proposal.client_id,
        projectId: document.proposal.project_id,
        proposalNumber: document.proposal.proposal_number,
        projectName: document.version.project_name || document.proposal.title,
        clientName: document.version.client_display_name || '',
        invoiceId: deposit.invoiceId,
        invoiceNumber: issued.invoiceNumber,
        invoiceTotalMinor: issued.totalMinor,
        currency: issued.currency,
      });
    } catch {
      // Notification failure must not lose acceptance truth.
    }

    return {
      proposalId: document.proposal.id,
      proposalVersionId: document.version.id,
      acceptanceId: acceptance.id,
      invoiceId: deposit.invoiceId,
      invoiceNumber: issued.invoiceNumber,
      invoiceTotalMinor: issued.totalMinor,
      currency: issued.currency,
      alreadyAccepted: true,
    };
  }

  if (!canAcceptResolvedProposal(document)) {
    if (document.proposal.status === 'changes_requested') {
      throw new AcceptanceError(
        'invalid',
        'This proposal version has a pending change request. Che Xu Studio will send a revised proposal.',
      );
    }
    throw new AcceptanceError(
      'expired',
      'This proposal has expired. Please contact Che Xu Studio for an updated proposal.',
    );
  }

  const evidence = {
    proposal_number: document.proposal.proposal_number,
    version_number: document.version.version_number,
    acceptance_text_version: ACCEPTANCE_TEXT_VERSION,
  };

  // IP intentionally omitted (privacy). Cap user-agent length; treat as untrusted.
  const { data: inserted, error: insertError } = await service
    .from('proposal_acceptances')
    .insert({
      proposal_id: document.proposal.id,
      proposal_version_id: document.version.id,
      client_id: document.proposal.client_id,
      accepted_by_name: name,
      accepted_by_email: email,
      acceptance_method: 'secure_link',
      user_agent: capUserAgent(input.userAgent),
      ip_address: null,
      evidence_metadata: evidence,
    })
    .select('id')
    .maybeSingle();

  let acceptanceId = inserted?.id ?? null;
  if (insertError) {
    // Unique violation → concurrent accept; load existing.
    const { data: raced } = await service
      .from('proposal_acceptances')
      .select('id')
      .eq('proposal_version_id', document.version.id)
      .maybeSingle();
    if (!raced) {
      throw new AcceptanceError('failed', 'Unable to record acceptance.');
    }
    acceptanceId = raced.id;
  }

  if (!acceptanceId) {
    throw new AcceptanceError('failed', 'Unable to record acceptance.');
  }

  await service
    .from('proposals')
    .update({
      status: 'accepted',
      accepted_at: new Date().toISOString(),
      current_version_id: document.version.id,
    })
    .eq('id', document.proposal.id)
    .neq('status', 'accepted');

  await recordStudioActivity(service, {
    actorProfileId: null,
    action: 'proposal.accepted',
    clientId: document.proposal.client_id,
    projectId: document.proposal.project_id,
    subjectType: 'proposal',
    subjectId: document.proposal.id,
    metadata: {
      proposal_version_id: document.version.id,
      version_number: document.version.version_number,
      acceptance_id: acceptanceId,
    },
  });

  const deposit = await getOrCreateDepositInvoice(service, {
    proposalId: document.proposal.id,
    proposalVersionId: document.version.id,
    actorProfileId: null,
  });
  const issued = await ensureDepositIssued(service, deposit.invoiceId);
  await ensureProjectDepositDue(service, document.proposal.project_id, document.proposal.client_id);

  try {
    const { enqueueProposalAcceptedNotification } = await import('../email/notifications');
    await enqueueProposalAcceptedNotification(service, {
      proposalId: document.proposal.id,
      proposalVersionId: document.version.id,
      clientId: document.proposal.client_id,
      projectId: document.proposal.project_id,
      proposalNumber: document.proposal.proposal_number,
      projectName: document.version.project_name || document.proposal.title,
      clientName: document.version.client_display_name || '',
      invoiceId: deposit.invoiceId,
      invoiceNumber: issued.invoiceNumber,
      invoiceTotalMinor: issued.totalMinor,
      currency: issued.currency,
    });
  } catch {
    // Notification failure must not lose acceptance truth.
  }

  return {
    proposalId: document.proposal.id,
    proposalVersionId: document.version.id,
    acceptanceId,
    invoiceId: deposit.invoiceId,
    invoiceNumber: issued.invoiceNumber,
    invoiceTotalMinor: issued.totalMinor,
    currency: issued.currency,
    alreadyAccepted: Boolean(insertError),
  };
}

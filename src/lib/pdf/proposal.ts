/**
 * Canonical Proposal PDF — bound to exact immutable Proposal Version.
 */

import type { StudioSupabaseClient, StudioSupabaseServiceClient } from '../supabase/types';
import { buildProposalDocumentViewModel } from '../documents/proposal-view-model';
import { renderProposalDocumentHtml } from '../documents/html';
import type { CurrencyCode } from '../supabase/domain';
import { recordStudioActivity } from '../studio/activity';
import { renderHtmlToPdf } from './renderer';
import {
  buildProposalStoragePath,
  uploadPrivatePdf,
} from './storage';
import {
  findCanonicalDocument,
  markDocumentFailed,
  markDocumentReady,
  reserveCanonicalDocument,
  supersedeCanonicalDocument,
} from './documents';
import { sha256Hex, type CanonicalDocumentRow } from './types';

type AnyClient = StudioSupabaseClient | StudioSupabaseServiceClient;

export class ProposalPdfError extends Error {
  readonly code: 'not_found' | 'invalid' | 'provider' | 'failed';

  constructor(code: ProposalPdfError['code'], message: string) {
    super(message);
    this.name = 'ProposalPdfError';
    this.code = code;
  }
}

export async function getOrCreateProposalPdf(
  client: AnyClient,
  input: {
    proposalId: string;
    versionId: string;
    actorProfileId?: string | null;
    forceRegenerate?: boolean;
    browser?: unknown;
  },
): Promise<{ document: CanonicalDocumentRow; created: boolean }> {
  const { data: version, error: versionError } = await client
    .from('proposal_versions')
    .select(
      `id, proposal_id, version_number, title, is_immutable, finalized_at,
       client_display_name, project_name, introduction, project_overview, objectives,
       scope, deliverables, timeline, payment_schedule, terms_and_conditions, notes,
       subtotal_minor, discount_minor, tax_minor, total_minor, tax_bps, currency`,
    )
    .eq('id', input.versionId)
    .eq('proposal_id', input.proposalId)
    .maybeSingle();

  if (versionError || !version) {
    throw new ProposalPdfError('not_found', 'Proposal version not found.');
  }
  if (!version.is_immutable) {
    throw new ProposalPdfError('invalid', 'Finalize the proposal version before generating a PDF.');
  }

  const { data: proposal, error: proposalError } = await client
    .from('proposals')
    .select('id, proposal_number, expires_at, client_id, project_id')
    .eq('id', input.proposalId)
    .maybeSingle();
  if (proposalError || !proposal) {
    throw new ProposalPdfError('not_found', 'Proposal not found.');
  }

  const existing = await findCanonicalDocument(client, {
    resourceType: 'proposal',
    resourceId: proposal.id,
    documentType: 'proposal_pdf',
    versionId: version.id,
  });

  if (existing?.status === 'ready' && !input.forceRegenerate) {
    return { document: existing, created: false };
  }

  if (input.forceRegenerate && existing?.status === 'ready') {
    await supersedeCanonicalDocument(client, existing.id);
  }

  const nextVersion =
    input.forceRegenerate && existing ? existing.generation_version + 1 : undefined;

  const reserved = await reserveCanonicalDocument(client, {
    resourceType: 'proposal',
    resourceId: proposal.id,
    documentType: 'proposal_pdf',
    versionId: version.id,
    createdBy: input.actorProfileId ?? null,
    storagePathPlaceholder: `proposals/${proposal.id}/versions/${version.id}/pending.pdf`,
    generationVersion: nextVersion,
    metadata: { proposal_number: proposal.proposal_number, version_number: version.version_number },
  });

  if (reserved.row.status === 'ready') {
    return { document: reserved.row, created: false };
  }

  const { data: items } = await client
    .from('proposal_items')
    .select('*')
    .eq('proposal_version_id', version.id)
    .order('sort_order', { ascending: true });

  const vm = buildProposalDocumentViewModel({
    proposalNumber: proposal.proposal_number,
    versionNumber: version.version_number,
    title: version.title,
    clientDisplayName: version.client_display_name || '',
    projectName: version.project_name || '',
    introduction: version.introduction,
    projectOverview: version.project_overview,
    objectives: version.objectives,
    scope: version.scope,
    deliverables: version.deliverables,
    timeline: version.timeline,
    paymentSchedule: version.payment_schedule,
    termsAndConditions: version.terms_and_conditions,
    notes: version.notes,
    items: items ?? [],
    subtotalMinor: version.subtotal_minor,
    discountMinor: version.discount_minor,
    taxMinor: version.tax_minor,
    totalMinor: version.total_minor,
    taxBps: version.tax_bps,
    currency: version.currency as CurrencyCode,
    expiresAt: proposal.expires_at,
    finalizedAt: version.finalized_at,
  });

  const html = renderProposalDocumentHtml(vm);
  const rendered = await renderHtmlToPdf(html, { browser: input.browser as never });
  if (!rendered.ok) {
    await markDocumentFailed(client, reserved.row.id, rendered.error);
    await recordStudioActivity(client, {
      actorProfileId: input.actorProfileId ?? null,
      action: 'document.generation_failed',
      clientId: proposal.client_id,
      projectId: proposal.project_id,
      subjectType: 'proposal',
      subjectId: proposal.id,
      metadata: {
        document_type: 'proposal_pdf',
        version_id: version.id,
        error: rendered.error,
      },
    });
    throw new ProposalPdfError('provider', rendered.error);
  }

  const checksum = await sha256Hex(rendered.bytes);
  const storagePath = buildProposalStoragePath({
    proposalId: proposal.id,
    versionId: version.id,
    documentId: reserved.row.id,
  });

  try {
    await uploadPrivatePdf(client as StudioSupabaseServiceClient, {
      path: storagePath,
      bytes: rendered.bytes,
    });
  } catch {
    await markDocumentFailed(client, reserved.row.id, 'storage-upload-failed');
    throw new ProposalPdfError('failed', 'Unable to store PDF.');
  }

  await markDocumentReady(client, {
    documentId: reserved.row.id,
    storagePath,
    fileSize: rendered.bytes.byteLength,
    checksum,
  });

  await recordStudioActivity(client, {
    actorProfileId: input.actorProfileId ?? null,
    action: input.forceRegenerate ? 'proposal.pdf_regenerated' : 'proposal.pdf_generated',
    clientId: proposal.client_id,
    projectId: proposal.project_id,
    subjectType: 'proposal',
    subjectId: proposal.id,
    metadata: {
      document_id: reserved.row.id,
      version_id: version.id,
      generation_version: reserved.row.generation_version,
      file_size: rendered.bytes.byteLength,
    },
  });

  const ready = await findCanonicalDocument(client, {
    resourceType: 'proposal',
    resourceId: proposal.id,
    documentType: 'proposal_pdf',
    versionId: version.id,
  });
  if (!ready || ready.status !== 'ready') {
    throw new ProposalPdfError('failed', 'PDF metadata was not finalized.');
  }
  return { document: ready, created: true };
}

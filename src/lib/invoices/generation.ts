/**
 * Idempotent proposal-derived invoice generation.
 * Phase 10 will call getOrCreateDepositInvoice after acceptance.
 */

import type { StudioSupabaseClient } from '../supabase/types';
import type { CurrencyCode } from '../supabase/domain';
import { allocateDepositFinal } from '../finance/invoice-calculations';
import { recordStudioActivity } from '../studio/activity';
import { buildClientIdentitySnapshot, snapshotColumns } from './snapshots';
import { getStudioPaymentDefaults } from './queries';
import { InvoiceMutationError } from './mutations';
import {
  defaultDueDate,
  generationKeyFor,
  todayIsoDateUtc,
} from './workflow';
import { formatScaledQuantity } from '../finance/calculations';
import { bpsToPercentInput } from '../money/parse';

async function nextInvoiceNumber(supabase: StudioSupabaseClient): Promise<string> {
  const year = new Date().getFullYear();
  const defaults = await getStudioPaymentDefaults(supabase);
  const { data, error } = await supabase.rpc('next_document_number', {
    p_counter_type: 'invoice',
    p_prefix: defaults.invoicePrefix,
    p_year: year,
  });
  if (error || !data) {
    throw new InvoiceMutationError('failed', 'Unable to allocate invoice number.');
  }
  return String(data);
}

type CommercialAgreement = {
  proposalId: string;
  proposalVersionId: string;
  clientId: string;
  projectId: string;
  projectName: string;
  currency: CurrencyCode;
  taxBps: number;
  depositBps: number;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  isImmutable: boolean;
};

async function loadCommercialAgreement(
  supabase: StudioSupabaseClient,
  input: { proposalId: string; proposalVersionId?: string },
): Promise<CommercialAgreement> {
  const { data: proposal, error: proposalError } = await supabase
    .from('proposals')
    .select('id, client_id, project_id, current_version_id, status')
    .eq('id', input.proposalId)
    .maybeSingle();
  if (proposalError || !proposal) {
    throw new InvoiceMutationError('not_found', 'Proposal not found.');
  }

  const versionId = input.proposalVersionId || proposal.current_version_id;
  if (!versionId) {
    throw new InvoiceMutationError('invalid', 'Proposal has no version to invoice from.');
  }

  const { data: version, error: versionError } = await supabase
    .from('proposal_versions')
    .select(
      'id, proposal_id, subtotal_minor, discount_minor, tax_minor, total_minor, currency, tax_bps, deposit_bps, is_immutable, project_name',
    )
    .eq('id', versionId)
    .eq('proposal_id', proposal.id)
    .maybeSingle();
  if (versionError || !version) {
    throw new InvoiceMutationError('not_found', 'Proposal version not found.');
  }

  // Prefer finalized/immutable commercial snapshots. Allow draft versions for internal testing
  // with an explicit warning path (caller may still generate).
  const { data: project } = await supabase
    .from('projects')
    .select('id, name')
    .eq('id', proposal.project_id)
    .maybeSingle();
  if (!project) {
    throw new InvoiceMutationError('not_found', 'Related project is unavailable.');
  }

  return {
    proposalId: proposal.id,
    proposalVersionId: version.id,
    clientId: proposal.client_id,
    projectId: proposal.project_id,
    projectName: version.project_name || project.name,
    currency: (version.currency as CurrencyCode) || 'CAD',
    taxBps: version.tax_bps,
    depositBps: version.deposit_bps,
    subtotalMinor: Number(version.subtotal_minor),
    discountMinor: Number(version.discount_minor),
    taxMinor: Number(version.tax_minor),
    totalMinor: Number(version.total_minor),
    isImmutable: Boolean(version.is_immutable),
  };
}

async function findByGenerationKey(
  supabase: StudioSupabaseClient,
  generationKey: string,
): Promise<{ id: string; status: string } | null> {
  const { data, error } = await supabase
    .from('invoices')
    .select('id, status')
    .eq('generation_key', generationKey)
    .order('created_at', { ascending: true });
  if (error) throw new InvoiceMutationError('failed', 'Unable to check existing invoices.');
  if (!data?.length) return null;
  const active = data.find((row) => row.status !== 'void');
  if (active) return active;
  // Voided only — do not silently recreate (Phase 9 correction policy).
  return { id: data[0].id, status: 'void' };
}

async function createStageInvoice(
  supabase: StudioSupabaseClient,
  input: {
    agreement: CommercialAgreement;
    invoiceType: 'deposit' | 'final';
    baseMinor: number;
    taxMinor: number;
    totalMinor: number;
    lineDescription: string;
    actorProfileId: string | null;
  },
): Promise<string> {
  const generationKey = generationKeyFor(input.agreement.proposalVersionId, input.invoiceType);
  const existing = await findByGenerationKey(supabase, generationKey);
  if (existing) {
    if (existing.status === 'void') {
      throw new InvoiceMutationError(
        'conflict',
        `A voided ${input.invoiceType} invoice already exists for this proposal version. Create a corrected invoice explicitly rather than regenerating.`,
      );
    }
    return existing.id;
  }

  const defaults = await getStudioPaymentDefaults(supabase);
  const issueDate = todayIsoDateUtc();
  const dueDate = defaultDueDate({
    invoiceType: input.invoiceType,
    issueDate,
    paymentTermsDays: defaults.paymentTermsDays,
  });

  const snapshot = await buildClientIdentitySnapshot(supabase, {
    clientId: input.agreement.clientId,
    projectId: input.agreement.projectId,
  });
  // Prefer snapshotted project name from proposal version.
  snapshot.projectName = input.agreement.projectName;

  const invoiceNumber = await nextInvoiceNumber(supabase);

  // Discount is allocated into net base already — do not re-apply on stage invoices.
  const { data: invoice, error } = await supabase
    .from('invoices')
    .insert({
      client_id: input.agreement.clientId,
      project_id: input.agreement.projectId,
      proposal_id: input.agreement.proposalId,
      proposal_version_id: input.agreement.proposalVersionId,
      generation_key: generationKey,
      invoice_number: invoiceNumber,
      invoice_type: input.invoiceType,
      status: 'draft',
      currency: input.agreement.currency,
      issue_date: issueDate,
      due_date: dueDate,
      subtotal_minor: input.baseMinor,
      discount_minor: 0,
      tax_minor: input.taxMinor,
      tax_bps: input.agreement.taxBps,
      total_minor: input.totalMinor,
      amount_paid_minor: 0,
      balance_due_minor: input.totalMinor,
      payment_instructions:
        'Online payment will be enabled after Stripe integration (Phase 11).',
      created_by: input.actorProfileId,
      ...snapshotColumns(snapshot),
    })
    .select('id')
    .single();

  if (error || !invoice) {
    // Concurrent insert may hit unique generation_key — return existing.
    const raced = await findByGenerationKey(supabase, generationKey);
    if (raced && raced.status !== 'void') return raced.id;
    throw new InvoiceMutationError('failed', `Unable to create ${input.invoiceType} invoice.`);
  }

  const { error: itemError } = await supabase.from('invoice_items').insert({
    invoice_id: invoice.id,
    description: input.lineDescription,
    quantity: Number(formatScaledQuantity(10_000)),
    rate_minor: input.baseMinor,
    amount_minor: input.baseMinor,
    sort_order: 0,
  });
  if (itemError) {
    await supabase.from('invoices').delete().eq('id', invoice.id).eq('status', 'draft');
    throw new InvoiceMutationError('failed', 'Unable to create invoice line item.');
  }

  await recordStudioActivity(supabase, {
    actorProfileId: input.actorProfileId,
    action:
      input.invoiceType === 'deposit' ? 'invoice.deposit_generated' : 'invoice.final_generated',
    clientId: input.agreement.clientId,
    projectId: input.agreement.projectId,
    subjectType: 'invoice',
    subjectId: invoice.id,
    metadata: {
      invoice_type: input.invoiceType,
      proposal_version_id: input.agreement.proposalVersionId,
      generation_key: generationKey,
      total_minor: input.totalMinor,
      currency: input.agreement.currency,
      deposit_bps: input.agreement.depositBps,
    },
  });

  return invoice.id;
}

/**
 * Idempotent deposit invoice from proposal version financial snapshot.
 * Retries return the same invoice without consuming another number.
 */
export async function getOrCreateDepositInvoice(
  supabase: StudioSupabaseClient,
  input: {
    proposalId: string;
    proposalVersionId?: string;
    actorProfileId?: string | null;
  },
): Promise<{ invoiceId: string; created: boolean }> {
  const agreement = await loadCommercialAgreement(supabase, input);
  const generationKey = generationKeyFor(agreement.proposalVersionId, 'deposit');
  const existing = await findByGenerationKey(supabase, generationKey);
  if (existing && existing.status !== 'void') {
    return { invoiceId: existing.id, created: false };
  }
  if (existing?.status === 'void') {
    throw new InvoiceMutationError(
      'conflict',
      'A voided deposit invoice already exists for this proposal version.',
    );
  }

  const allocation = allocateDepositFinal({
    subtotalMinor: agreement.subtotalMinor,
    discountMinor: agreement.discountMinor,
    taxMinor: agreement.taxMinor,
    totalMinor: agreement.totalMinor,
    depositBps: agreement.depositBps,
  });

  const pct = bpsToPercentInput(agreement.depositBps);
  const invoiceId = await createStageInvoice(supabase, {
    agreement,
    invoiceType: 'deposit',
    baseMinor: allocation.depositBaseMinor,
    taxMinor: allocation.depositTaxMinor,
    totalMinor: allocation.depositTotalMinor,
    lineDescription: `${pct}% Project Deposit — ${agreement.projectName}`,
    actorProfileId: input.actorProfileId ?? null,
  });

  return { invoiceId, created: true };
}

/**
 * Idempotent final invoice. Remaining base/tax absorb allocation remainder.
 */
export async function getOrCreateFinalInvoice(
  supabase: StudioSupabaseClient,
  input: {
    proposalId: string;
    proposalVersionId?: string;
    actorProfileId?: string | null;
  },
): Promise<{ invoiceId: string; created: boolean }> {
  const agreement = await loadCommercialAgreement(supabase, input);
  const generationKey = generationKeyFor(agreement.proposalVersionId, 'final');
  const existing = await findByGenerationKey(supabase, generationKey);
  if (existing && existing.status !== 'void') {
    return { invoiceId: existing.id, created: false };
  }
  if (existing?.status === 'void') {
    throw new InvoiceMutationError(
      'conflict',
      'A voided final invoice already exists for this proposal version.',
    );
  }

  const allocation = allocateDepositFinal({
    subtotalMinor: agreement.subtotalMinor,
    discountMinor: agreement.discountMinor,
    taxMinor: agreement.taxMinor,
    totalMinor: agreement.totalMinor,
    depositBps: agreement.depositBps,
  });

  const invoiceId = await createStageInvoice(supabase, {
    agreement,
    invoiceType: 'final',
    baseMinor: allocation.finalBaseMinor,
    taxMinor: allocation.finalTaxMinor,
    totalMinor: allocation.finalTotalMinor,
    lineDescription: `Final Project Balance — ${agreement.projectName}`,
    actorProfileId: input.actorProfileId ?? null,
  });

  return { invoiceId, created: true };
}

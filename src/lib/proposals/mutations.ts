/**
 * Proposal mutations — allowlisted fields, server-side totals, finalize ≠ sent.
 */

import type { StudioSupabaseClient } from '../supabase/types';
import { recordStudioActivity } from '../studio/activity';
import { formatPaymentScheduleText } from '../finance/calculations';
import { formatScaledQuantity } from '../finance/calculations';
import {
  PROPOSAL_CONFLICT_ERROR,
  PROPOSAL_IMMUTABLE_ERROR,
  type createProposalSchema,
} from './validation';
import { parseDraftProposalPayload } from './validation';
import { getDefaultProposalTemplate, getProposalTemplate } from './queries';
import { transitionProject } from '../projects/mutations';
import type { ProposalRow, ProposalVersionRow, ProposalTemplateRow } from './types';
import type { z } from 'zod';
import { bpsToPercentInput } from '../money/parse';

export class ProposalMutationError extends Error {
  readonly code: 'conflict' | 'not_found' | 'forbidden' | 'invalid' | 'immutable' | 'failed';

  constructor(code: ProposalMutationError['code'], message: string) {
    super(message);
    this.name = 'ProposalMutationError';
    this.code = code;
  }
}

type CreateInput = z.infer<typeof createProposalSchema>;

async function nextProposalNumber(supabase: StudioSupabaseClient): Promise<string> {
  const year = new Date().getFullYear();
  const { data: settings } = await supabase
    .from('settings')
    .select('proposal_prefix')
    .limit(1)
    .maybeSingle();
  const prefix = settings?.proposal_prefix || 'CXS-P';
  const { data, error } = await supabase.rpc('next_document_number', {
    p_counter_type: 'proposal',
    p_prefix: prefix,
    p_year: year,
  });
  if (error || !data) {
    throw new ProposalMutationError('failed', 'Unable to allocate proposal number.');
  }
  return String(data);
}

export async function createProposalFromProject(
  supabase: StudioSupabaseClient,
  input: CreateInput,
  actorProfileId: string | null,
): Promise<string> {
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select(
      'id, client_id, name, description, scope, deliverables, project_price_minor, currency, tax_bps, deposit_bps, status, start_date, target_completion_date',
    )
    .eq('id', input.projectId)
    .maybeSingle();
  if (projectError) throw new ProposalMutationError('failed', 'Unable to create proposal.');
  if (!project) throw new ProposalMutationError('not_found', 'The selected project is unavailable.');

  const [{ data: client }, { data: primary }] = await Promise.all([
    supabase
      .from('clients')
      .select('id, company_name, display_name, billing_email, status')
      .eq('id', project.client_id)
      .maybeSingle(),
    supabase
      .from('client_contacts')
      .select('name, email')
      .eq('client_id', project.client_id)
      .eq('is_primary', true)
      .maybeSingle(),
  ]);
  if (!client) throw new ProposalMutationError('not_found', 'The selected project is unavailable.');

  let template: ProposalTemplateRow | null = null;
  if (input.templateId) {
    template = await getProposalTemplate(supabase, input.templateId);
    if (!template || template.is_archived) {
      throw new ProposalMutationError('invalid', 'Selected template is unavailable.');
    }
  } else {
    template = await getDefaultProposalTemplate(supabase);
  }

  const proposalNumber = await nextProposalNumber(supabase);
  const title =
    input.title?.trim() ||
    `${project.name} Proposal`;

  const paymentSchedule =
    template?.payment_terms?.trim() ||
    formatPaymentScheduleText({ depositBps: project.deposit_bps });

  const timelineParts = [
    project.start_date ? `Start: ${project.start_date}` : null,
    project.target_completion_date ? `Target completion: ${project.target_completion_date}` : null,
    template?.timeline?.trim() || null,
  ].filter(Boolean);

  const { data: proposal, error: proposalError } = await supabase
    .from('proposals')
    .insert({
      client_id: project.client_id,
      project_id: project.id,
      proposal_number: proposalNumber,
      title,
      status: 'draft',
      created_by: actorProfileId,
    })
    .select('*')
    .single();
  if (proposalError || !proposal) {
    throw new ProposalMutationError('failed', 'Unable to create proposal.');
  }

  const rateMinor = Number(project.project_price_minor) || 0;
  const { data: version, error: versionError } = await supabase
    .from('proposal_versions')
    .insert({
      proposal_id: proposal.id,
      version_number: 1,
      title,
      introduction: template?.introduction ?? null,
      project_overview: template?.project_overview ?? project.description,
      objectives: template?.objectives ?? null,
      scope: template?.scope ?? project.scope,
      deliverables: template?.deliverables ?? project.deliverables,
      timeline: timelineParts.join('\n') || null,
      payment_schedule: paymentSchedule,
      terms_and_conditions: template?.terms_and_conditions ?? null,
      notes: template?.notes ?? null,
      sections: {},
      subtotal_minor: rateMinor,
      discount_minor: 0,
      tax_minor: 0,
      total_minor: rateMinor,
      currency: project.currency,
      is_immutable: false,
      created_by: actorProfileId,
      client_display_name: client.display_name || client.company_name,
      client_contact_name: primary?.name ?? null,
      client_contact_email: primary?.email ?? client.billing_email,
      project_name: project.name,
      tax_bps: project.tax_bps,
      deposit_bps: project.deposit_bps,
    })
    .select('*')
    .single();

  if (versionError || !version) {
    throw new ProposalMutationError('failed', 'Unable to create proposal version.');
  }

  // Recalculate with tax using finance helper after insert item
  const { calculateProposalTotals } = await import('../finance/calculations');
  const totals = calculateProposalTotals({
    lines: [{ optional: false, selected: true, amountMinor: rateMinor }],
    discountMinor: 0,
    taxBps: project.tax_bps,
  });

  await supabase.from('proposal_items').insert({
    proposal_version_id: version.id,
    item_type: 'service',
    description: project.name,
    quantity: 1,
    rate_minor: rateMinor,
    amount_minor: rateMinor,
    sort_order: 0,
    optional: false,
    selected: true,
  });

  await supabase
    .from('proposal_versions')
    .update({
      subtotal_minor: totals.subtotalMinor,
      discount_minor: totals.discountMinor,
      tax_minor: totals.taxMinor,
      total_minor: totals.totalMinor,
    })
    .eq('id', version.id);

  await supabase
    .from('proposals')
    .update({ current_version_id: version.id })
    .eq('id', proposal.id);

  if (project.status === 'inquiry') {
    try {
      await transitionProject(supabase, project.id, 'inquiry', 'proposal', actorProfileId);
    } catch {
      // Proposal still created; project transition is best-effort via workflow service.
    }
  }

  await recordStudioActivity(supabase, {
    actorProfileId,
    action: 'proposal.created',
    clientId: project.client_id,
    projectId: project.id,
    subjectType: 'proposal',
    subjectId: proposal.id,
    metadata: {
      proposalNumber,
      version: 1,
      templateId: template?.id ?? null,
    },
  });

  return proposal.id;
}

export async function saveProposalDraft(
  supabase: StudioSupabaseClient,
  proposalId: string,
  versionId: string,
  raw: Record<string, string>,
  actorProfileId: string | null,
): Promise<ProposalVersionRow> {
  const parsed = parseDraftProposalPayload(raw);
  if (!parsed.success) {
    throw new ProposalMutationError('invalid', parsed.error);
  }

  const { data: proposal, error: proposalError } = await supabase
    .from('proposals')
    .select('id, status, updated_at, client_id, project_id, current_version_id')
    .eq('id', proposalId)
    .maybeSingle();
  if (proposalError) throw new ProposalMutationError('failed', 'Unable to save proposal.');
  if (!proposal) throw new ProposalMutationError('not_found', 'Proposal not found.');
  if (proposal.status === 'archived' || proposal.status === 'accepted') {
    throw new ProposalMutationError('immutable', PROPOSAL_IMMUTABLE_ERROR);
  }
  if (proposal.updated_at !== parsed.data.expectedUpdatedAt) {
    throw new ProposalMutationError('conflict', PROPOSAL_CONFLICT_ERROR);
  }

  const { data: version, error: versionError } = await supabase
    .from('proposal_versions')
    .select('*')
    .eq('id', versionId)
    .eq('proposal_id', proposalId)
    .maybeSingle();
  if (versionError || !version) {
    throw new ProposalMutationError('not_found', 'Proposal version not found.');
  }
  if (version.is_immutable) {
    throw new ProposalMutationError('immutable', PROPOSAL_IMMUTABLE_ERROR);
  }

  const expiresAt = parsed.data.expiresAt
    ? parsed.data.expiresAt.length === 10
      ? `${parsed.data.expiresAt}T23:59:59.000Z`
      : parsed.data.expiresAt
    : null;

  const { data: updatedVersion, error: updateError } = await supabase
    .from('proposal_versions')
    .update({
      title: parsed.data.title,
      introduction: parsed.data.introduction,
      project_overview: parsed.data.projectOverview,
      objectives: parsed.data.objectives,
      scope: parsed.data.scope,
      deliverables: parsed.data.deliverables,
      timeline: parsed.data.timeline,
      payment_schedule: parsed.data.paymentSchedule,
      terms_and_conditions: parsed.data.termsAndConditions,
      notes: parsed.data.notes,
      currency: parsed.data.currency,
      expires_at: expiresAt,
      tax_bps: parsed.data.taxBps,
      deposit_bps: parsed.data.depositBps,
      subtotal_minor: parsed.data.totals.subtotalMinor,
      discount_minor: parsed.data.totals.discountMinor,
      tax_minor: parsed.data.totals.taxMinor,
      total_minor: parsed.data.totals.totalMinor,
    })
    .eq('id', versionId)
    .eq('is_immutable', false)
    .select('*')
    .maybeSingle();

  if (updateError) throw new ProposalMutationError('failed', 'Unable to save proposal.');
  if (!updatedVersion) {
    throw new ProposalMutationError('immutable', PROPOSAL_IMMUTABLE_ERROR);
  }

  await supabase.from('proposal_items').delete().eq('proposal_version_id', versionId);
  const itemRows = parsed.data.lines.map((line) => ({
    proposal_version_id: versionId,
    item_type: line.itemType,
    description: line.description,
    quantity: Number(formatScaledQuantity(line.quantityScaled)),
    rate_minor: line.rateMinor,
    amount_minor: line.amountMinor,
    sort_order: line.sortOrder,
    optional: line.optional,
    selected: line.selected,
  }));
  const { error: itemsError } = await supabase.from('proposal_items').insert(itemRows);
  if (itemsError) throw new ProposalMutationError('failed', 'Unable to save proposal items.');

  await supabase
    .from('proposals')
    .update({
      title: parsed.data.title,
      expires_at: expiresAt,
      current_version_id: versionId,
    })
    .eq('id', proposalId);

  await recordStudioActivity(supabase, {
    actorProfileId,
    action: 'proposal.updated',
    clientId: proposal.client_id,
    projectId: proposal.project_id,
    subjectType: 'proposal',
    subjectId: proposalId,
    metadata: { fields: ['content', 'items', 'totals'], versionId },
  });

  return updatedVersion;
}

export async function finalizeProposalVersion(
  supabase: StudioSupabaseClient,
  proposalId: string,
  versionId: string,
  actorProfileId: string | null,
): Promise<ProposalVersionRow> {
  const { data, error } = await supabase.rpc('finalize_proposal_version', {
    p_proposal_id: proposalId,
    p_version_id: versionId,
  });
  if (error || !data) {
    const message = `${error?.message ?? ''}`;
    if (/immutable|already/i.test(message)) {
      throw new ProposalMutationError('immutable', PROPOSAL_IMMUTABLE_ERROR);
    }
    throw new ProposalMutationError('failed', 'Unable to finalize proposal version.');
  }
  const row = (Array.isArray(data) ? data[0] : data) as ProposalVersionRow;
  const proposal = await supabase
    .from('proposals')
    .select('client_id, project_id')
    .eq('id', proposalId)
    .maybeSingle();
  await recordStudioActivity(supabase, {
    actorProfileId,
    action: 'proposal.finalized',
    clientId: proposal.data?.client_id,
    projectId: proposal.data?.project_id,
    subjectType: 'proposal',
    subjectId: proposalId,
    metadata: { versionId, versionNumber: row.version_number },
  });

  try {
    const { enqueueDocumentJob } = await import('../pdf/jobs');
    await enqueueDocumentJob(supabase, {
      documentType: 'proposal_pdf',
      resourceType: 'proposal',
      resourceId: proposalId,
      versionId,
      idempotencyKey: `proposal:${versionId}:pdf:v1`,
      createdBy: actorProfileId,
    });
  } catch {
    // PDF generation is a side effect — finalization must succeed.
  }

  return row;
}

export async function createProposalRevision(
  supabase: StudioSupabaseClient,
  proposalId: string,
  actorProfileId: string | null,
): Promise<ProposalVersionRow> {
  const { data, error } = await supabase.rpc('create_proposal_revision', {
    p_proposal_id: proposalId,
  });
  if (error || !data) {
    throw new ProposalMutationError('failed', 'Unable to create revision.');
  }
  const row = (Array.isArray(data) ? data[0] : data) as ProposalVersionRow;
  const proposal = await supabase
    .from('proposals')
    .select('client_id, project_id')
    .eq('id', proposalId)
    .maybeSingle();
  await recordStudioActivity(supabase, {
    actorProfileId,
    action: 'proposal.version_created',
    clientId: proposal.data?.client_id,
    projectId: proposal.data?.project_id,
    subjectType: 'proposal',
    subjectId: proposalId,
    metadata: { versionId: row.id, versionNumber: row.version_number },
  });
  return row;
}

export async function archiveProposal(
  supabase: StudioSupabaseClient,
  proposalId: string,
  actorProfileId: string | null,
): Promise<ProposalRow> {
  const { data, error } = await supabase
    .from('proposals')
    .update({ status: 'archived' })
    .eq('id', proposalId)
    .neq('status', 'archived')
    .select('*')
    .maybeSingle();
  if (error) throw new ProposalMutationError('failed', 'Unable to archive proposal.');
  if (!data) throw new ProposalMutationError('not_found', 'Proposal not found.');
  await recordStudioActivity(supabase, {
    actorProfileId,
    action: 'proposal.archived',
    clientId: data.client_id,
    projectId: data.project_id,
    subjectType: 'proposal',
    subjectId: proposalId,
    metadata: {},
  });
  return data;
}

export async function createProposalTemplate(
  supabase: StudioSupabaseClient,
  input: {
    name: string;
    description: string | null;
    introduction: string | null;
    projectOverview: string | null;
    objectives: string | null;
    scope: string | null;
    deliverables: string | null;
    timeline: string | null;
    paymentTerms: string | null;
    termsAndConditions: string | null;
    notes: string | null;
    makeDefault: boolean;
  },
  actorProfileId: string | null,
): Promise<string> {
  const { data, error } = await supabase
    .from('proposal_templates')
    .insert({
      name: input.name,
      description: input.description,
      introduction: input.introduction,
      project_overview: input.projectOverview,
      objectives: input.objectives,
      scope: input.scope,
      deliverables: input.deliverables,
      timeline: input.timeline,
      payment_terms: input.paymentTerms,
      terms_and_conditions: input.termsAndConditions,
      notes: input.notes,
      is_default: false,
      is_archived: false,
      created_by: actorProfileId,
    })
    .select('id')
    .single();
  if (error || !data) throw new ProposalMutationError('failed', 'Unable to save template.');

  if (input.makeDefault) {
    await supabase.rpc('set_default_proposal_template', { p_template_id: data.id });
    await recordStudioActivity(supabase, {
      actorProfileId,
      action: 'proposal_template.default_changed',
      subjectType: 'proposal_template',
      subjectId: data.id,
      metadata: {},
    });
  }

  await recordStudioActivity(supabase, {
    actorProfileId,
    action: 'proposal_template.created',
    subjectType: 'proposal_template',
    subjectId: data.id,
    metadata: { name: input.name },
  });
  return data.id;
}

export async function updateProposalTemplate(
  supabase: StudioSupabaseClient,
  templateId: string,
  input: {
    name: string;
    description: string | null;
    introduction: string | null;
    projectOverview: string | null;
    objectives: string | null;
    scope: string | null;
    deliverables: string | null;
    timeline: string | null;
    paymentTerms: string | null;
    termsAndConditions: string | null;
    notes: string | null;
    makeDefault: boolean;
  },
  actorProfileId: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('proposal_templates')
    .update({
      name: input.name,
      description: input.description,
      introduction: input.introduction,
      project_overview: input.projectOverview,
      objectives: input.objectives,
      scope: input.scope,
      deliverables: input.deliverables,
      timeline: input.timeline,
      payment_terms: input.paymentTerms,
      terms_and_conditions: input.termsAndConditions,
      notes: input.notes,
    })
    .eq('id', templateId)
    .eq('is_archived', false);
  if (error) throw new ProposalMutationError('failed', 'Unable to save template.');

  if (input.makeDefault) {
    await supabase.rpc('set_default_proposal_template', { p_template_id: templateId });
    await recordStudioActivity(supabase, {
      actorProfileId,
      action: 'proposal_template.default_changed',
      subjectType: 'proposal_template',
      subjectId: templateId,
      metadata: {},
    });
  }

  await recordStudioActivity(supabase, {
    actorProfileId,
    action: 'proposal_template.updated',
    subjectType: 'proposal_template',
    subjectId: templateId,
    metadata: { fields: ['content'] },
  });
}

export async function archiveProposalTemplate(
  supabase: StudioSupabaseClient,
  templateId: string,
  actorProfileId: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('proposal_templates')
    .update({ is_archived: true, is_default: false })
    .eq('id', templateId);
  if (error) throw new ProposalMutationError('failed', 'Unable to archive template.');
  await recordStudioActivity(supabase, {
    actorProfileId,
    action: 'proposal_template.archived',
    subjectType: 'proposal_template',
    subjectId: templateId,
    metadata: {},
  });
}

export { bpsToPercentInput };

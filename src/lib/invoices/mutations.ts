/**
 * Invoice mutations — allowlisted fields, server totals, issue/void, optimistic concurrency.
 */

import type { StudioSupabaseClient } from '../supabase/types';
import { recordStudioActivity } from '../studio/activity';
import { formatScaledQuantity } from '../finance/calculations';
import { balanceDueMinor } from '../finance/invoice-calculations';
import {
  INVOICE_CONFLICT_ERROR,
  INVOICE_IMMUTABLE_ERROR,
  type ParsedInvoiceItem,
} from './validation';
import { buildClientIdentitySnapshot, snapshotColumns } from './snapshots';
import { getInvoiceById, getInvoiceItems, getStudioPaymentDefaults } from './queries';
import {
  canEditInvoiceFinancials,
  canIssueInvoice,
  canVoidInvoice,
  todayIsoDateUtc,
} from './workflow';
import type { InvoiceRow } from './types';

export class InvoiceMutationError extends Error {
  readonly code: 'conflict' | 'not_found' | 'forbidden' | 'invalid' | 'immutable' | 'failed';

  constructor(code: InvoiceMutationError['code'], message: string) {
    super(message);
    this.name = 'InvoiceMutationError';
    this.code = code;
  }
}

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

function quantityFromScaled(scaled: number): number {
  return Number(formatScaledQuantity(scaled));
}

async function replaceDraftItems(
  supabase: StudioSupabaseClient,
  invoiceId: string,
  items: ParsedInvoiceItem[],
): Promise<void> {
  const { error: deleteError } = await supabase
    .from('invoice_items')
    .delete()
    .eq('invoice_id', invoiceId);
  if (deleteError) {
    throw new InvoiceMutationError('failed', 'Unable to update line items.');
  }

  const { error: insertError } = await supabase.from('invoice_items').insert(
    items.map((item, index) => ({
      invoice_id: invoiceId,
      description: item.description,
      quantity: quantityFromScaled(item.quantityScaled),
      rate_minor: item.rateMinor,
      amount_minor: item.amountMinor,
      sort_order: item.sortOrder ?? index,
    })),
  );
  if (insertError) {
    throw new InvoiceMutationError('failed', 'Unable to save line items.');
  }
}

export async function createManualInvoice(
  supabase: StudioSupabaseClient,
  input: {
    clientId: string;
    projectId: string | null;
    issueDate: string;
    dueDate: string;
    currency: 'CAD' | 'USD';
    discountMinor: number;
    taxBps: number;
    paymentInstructions: string | null;
    items: ParsedInvoiceItem[];
    totals: {
      subtotalMinor: number;
      discountMinor: number;
      taxMinor: number;
      totalMinor: number;
      balanceDueMinor: number;
    };
  },
  actorProfileId: string | null,
): Promise<string> {
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('id, status')
    .eq('id', input.clientId)
    .maybeSingle();
  if (clientError || !client) {
    throw new InvoiceMutationError('not_found', 'The selected client is unavailable.');
  }

  if (input.projectId) {
    const { data: project } = await supabase
      .from('projects')
      .select('id, client_id')
      .eq('id', input.projectId)
      .maybeSingle();
    if (!project || project.client_id !== input.clientId) {
      throw new InvoiceMutationError('invalid', 'Project does not belong to the selected client.');
    }
  }

  const snapshot = await buildClientIdentitySnapshot(supabase, {
    clientId: input.clientId,
    projectId: input.projectId,
  });
  const invoiceNumber = await nextInvoiceNumber(supabase);

  const { data: invoice, error } = await supabase
    .from('invoices')
    .insert({
      client_id: input.clientId,
      project_id: input.projectId,
      proposal_id: null,
      proposal_version_id: null,
      generation_key: null,
      invoice_number: invoiceNumber,
      invoice_type: 'manual',
      status: 'draft',
      currency: input.currency,
      issue_date: input.issueDate,
      due_date: input.dueDate,
      subtotal_minor: input.totals.subtotalMinor,
      discount_minor: input.totals.discountMinor,
      tax_minor: input.totals.taxMinor,
      tax_bps: input.taxBps,
      total_minor: input.totals.totalMinor,
      amount_paid_minor: 0,
      balance_due_minor: input.totals.balanceDueMinor,
      payment_instructions: input.paymentInstructions,
      created_by: actorProfileId,
      ...snapshotColumns(snapshot),
    })
    .select('id')
    .single();

  if (error || !invoice) {
    throw new InvoiceMutationError('failed', 'Unable to create invoice.');
  }

  try {
    await replaceDraftItems(supabase, invoice.id, input.items);
  } catch (err) {
    await supabase.from('invoices').delete().eq('id', invoice.id).eq('status', 'draft');
    throw err;
  }

  await recordStudioActivity(supabase, {
    actorProfileId,
    action: 'invoice.created',
    clientId: input.clientId,
    projectId: input.projectId,
    subjectType: 'invoice',
    subjectId: invoice.id,
    metadata: {
      invoice_type: 'manual',
      invoice_number: invoiceNumber,
      total_minor: input.totals.totalMinor,
      currency: input.currency,
    },
  });

  return invoice.id;
}

export async function saveInvoiceDraft(
  supabase: StudioSupabaseClient,
  invoiceId: string,
  input: {
    issueDate: string;
    dueDate: string;
    currency: 'CAD' | 'USD';
    discountMinor: number;
    taxBps: number;
    paymentInstructions: string | null;
    expectedUpdatedAt: string;
    items: ParsedInvoiceItem[];
    totals: {
      subtotalMinor: number;
      discountMinor: number;
      taxMinor: number;
      totalMinor: number;
      balanceDueMinor: number;
    };
  },
  actorProfileId: string | null,
): Promise<void> {
  const existing = await getInvoiceById(supabase, invoiceId);
  if (!existing) throw new InvoiceMutationError('not_found', 'Invoice not found.');
  if (!canEditInvoiceFinancials(existing.status)) {
    throw new InvoiceMutationError('immutable', INVOICE_IMMUTABLE_ERROR);
  }
  if (existing.updated_at !== input.expectedUpdatedAt) {
    throw new InvoiceMutationError('conflict', INVOICE_CONFLICT_ERROR);
  }

  // Deposit/final drafts: dates + payment instructions only. Allocated money stays fixed.
  if (existing.invoice_type === 'deposit' || existing.invoice_type === 'final') {
    const { data: updated, error } = await supabase
      .from('invoices')
      .update({
        issue_date: input.issueDate,
        due_date: input.dueDate,
        payment_instructions: input.paymentInstructions,
      })
      .eq('id', invoiceId)
      .eq('status', 'draft')
      .eq('updated_at', input.expectedUpdatedAt)
      .select('id')
      .maybeSingle();

    if (error) throw new InvoiceMutationError('failed', 'Unable to save invoice.');
    if (!updated) throw new InvoiceMutationError('conflict', INVOICE_CONFLICT_ERROR);

    await recordStudioActivity(supabase, {
      actorProfileId,
      action: 'invoice.updated',
      clientId: existing.client_id,
      projectId: existing.project_id,
      subjectType: 'invoice',
      subjectId: invoiceId,
      metadata: {
        invoice_type: existing.invoice_type,
        total_minor: existing.total_minor,
        currency: existing.currency,
      },
    });
    return;
  }

  const { data: updated, error } = await supabase
    .from('invoices')
    .update({
      issue_date: input.issueDate,
      due_date: input.dueDate,
      currency: input.currency,
      discount_minor: input.totals.discountMinor,
      tax_bps: input.taxBps,
      subtotal_minor: input.totals.subtotalMinor,
      tax_minor: input.totals.taxMinor,
      total_minor: input.totals.totalMinor,
      balance_due_minor: balanceDueMinor(input.totals.totalMinor, existing.amount_paid_minor),
      payment_instructions: input.paymentInstructions,
    })
    .eq('id', invoiceId)
    .eq('status', 'draft')
    .eq('updated_at', input.expectedUpdatedAt)
    .select('id')
    .maybeSingle();

  if (error) throw new InvoiceMutationError('failed', 'Unable to save invoice.');
  if (!updated) throw new InvoiceMutationError('conflict', INVOICE_CONFLICT_ERROR);

  await replaceDraftItems(supabase, invoiceId, input.items);

  await recordStudioActivity(supabase, {
    actorProfileId,
    action: 'invoice.updated',
    clientId: existing.client_id,
    projectId: existing.project_id,
    subjectType: 'invoice',
    subjectId: invoiceId,
    metadata: {
      invoice_type: existing.invoice_type,
      total_minor: input.totals.totalMinor,
      currency: input.currency,
    },
  });
}

export async function issueInvoice(
  supabase: StudioSupabaseClient,
  invoiceId: string,
  expectedUpdatedAt: string,
  actorProfileId: string | null,
): Promise<void> {
  const existing = await getInvoiceById(supabase, invoiceId);
  if (!existing) throw new InvoiceMutationError('not_found', 'Invoice not found.');
  if (!canIssueInvoice(existing.status)) {
    throw new InvoiceMutationError('invalid', 'Only draft invoices can be issued.');
  }
  if (existing.updated_at !== expectedUpdatedAt) {
    throw new InvoiceMutationError('conflict', INVOICE_CONFLICT_ERROR);
  }

  const items = await getInvoiceItems(supabase, invoiceId);
  if (items.length < 1) {
    throw new InvoiceMutationError('invalid', 'Add at least one line item before issuing.');
  }
  if (!existing.invoice_number?.trim()) {
    throw new InvoiceMutationError('invalid', 'Invoice number is missing.');
  }
  if (!existing.due_date || !existing.issue_date) {
    throw new InvoiceMutationError('invalid', 'Issue and due dates are required.');
  }
  if (existing.total_minor < 0 || existing.balance_due_minor !== existing.total_minor - existing.amount_paid_minor) {
    throw new InvoiceMutationError('invalid', 'Invoice totals are invalid.');
  }

  const snapshot = await buildClientIdentitySnapshot(supabase, {
    clientId: existing.client_id,
    projectId: existing.project_id,
  });

  const issueDate = existing.issue_date || todayIsoDateUtc();

  const { data: updated, error } = await supabase
    .from('invoices')
    .update({
      status: 'issued',
      issue_date: issueDate,
      ...snapshotColumns(snapshot),
    })
    .eq('id', invoiceId)
    .eq('status', 'draft')
    .eq('updated_at', expectedUpdatedAt)
    .select('id')
    .maybeSingle();

  if (error) throw new InvoiceMutationError('failed', 'Unable to issue invoice.');
  if (!updated) throw new InvoiceMutationError('conflict', INVOICE_CONFLICT_ERROR);

  await recordStudioActivity(supabase, {
    actorProfileId,
    action: 'invoice.issued',
    clientId: existing.client_id,
    projectId: existing.project_id,
    subjectType: 'invoice',
    subjectId: invoiceId,
    metadata: {
      invoice_type: existing.invoice_type,
      invoice_number: existing.invoice_number,
      total_minor: existing.total_minor,
      currency: existing.currency,
    },
  });

  try {
    const { enqueueDocumentJob } = await import('../pdf/jobs');
    await enqueueDocumentJob(supabase, {
      documentType: 'invoice_pdf',
      resourceType: 'invoice',
      resourceId: invoiceId,
      idempotencyKey: `invoice:${invoiceId}:pdf:v1`,
      createdBy: actorProfileId,
    });
  } catch {
    // PDF generation is a side effect — issue must succeed.
  }
}

export async function voidInvoice(
  supabase: StudioSupabaseClient,
  invoiceId: string,
  expectedUpdatedAt: string,
  actorProfileId: string | null,
): Promise<void> {
  const existing = await getInvoiceById(supabase, invoiceId);
  if (!existing) throw new InvoiceMutationError('not_found', 'Invoice not found.');
  if (!canVoidInvoice(existing)) {
    throw new InvoiceMutationError(
      'invalid',
      'Only unpaid issued invoices can be voided. Paid invoices require Phase 11 refund workflows.',
    );
  }
  if (existing.updated_at !== expectedUpdatedAt) {
    throw new InvoiceMutationError('conflict', INVOICE_CONFLICT_ERROR);
  }

  const { data: updated, error } = await supabase
    .from('invoices')
    .update({
      status: 'void',
      voided_at: new Date().toISOString(),
      // Preserve financial snapshot and number; balance remains for audit display.
    })
    .eq('id', invoiceId)
    .eq('updated_at', expectedUpdatedAt)
    .in('status', ['issued', 'sent', 'overdue'])
    .select('id')
    .maybeSingle();

  if (error) throw new InvoiceMutationError('failed', 'Unable to void invoice.');
  if (!updated) throw new InvoiceMutationError('conflict', INVOICE_CONFLICT_ERROR);

  await recordStudioActivity(supabase, {
    actorProfileId,
    action: 'invoice.voided',
    clientId: existing.client_id,
    projectId: existing.project_id,
    subjectType: 'invoice',
    subjectId: invoiceId,
    metadata: {
      invoice_type: existing.invoice_type,
      invoice_number: existing.invoice_number,
      total_minor: existing.total_minor,
      currency: existing.currency,
    },
  });
}

export type { InvoiceRow };

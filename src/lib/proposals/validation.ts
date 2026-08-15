import { z } from 'zod';
import { parseMajorToMinor, percentInputToBps } from '../money/parse';
import { parseQuantityToScaled, lineAmountMinor, calculateProposalTotals } from '../finance/calculations';
import { PROPOSAL_STATUSES, type ProposalStatus } from './workflow';
import type { CurrencyCode } from '../supabase/domain';

export const proposalSortSchema = z.enum([
  'updated_desc',
  'created_desc',
  'number_asc',
  'expires_asc',
  'value_desc',
]);
export type ProposalSort = z.infer<typeof proposalSortSchema>;

export const proposalListQuerySchema = z.object({
  q: z
    .string()
    .max(200)
    .optional()
    .transform((value) => value?.trim() || ''),
  status: z
    .string()
    .default('active')
    .transform((value) => value || 'active')
    .pipe(
      z.enum([
        'active',
        'all',
        'draft',
        'sent',
        'viewed',
        'accepted',
        'changes_requested',
        'expired',
        'declined',
        'archived',
      ]),
    ),
  clientId: z
    .string()
    .optional()
    .transform((v) => {
      const t = v?.trim() || '';
      return t.length ? t : null;
    })
    .refine((v) => v == null || z.uuid().safeParse(v).success, { message: 'Invalid client filter' }),
  sort: proposalSortSchema.default('updated_desc'),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(25),
});
export type ProposalListQuery = z.infer<typeof proposalListQuerySchema>;

const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .optional()
    .transform((value) => {
      if (value == null) return null;
      const trimmed = value.trim();
      return trimmed.length ? trimmed : null;
    });

export const proposalItemInputSchema = z.object({
  id: z.string().uuid().optional(),
  itemType: z.enum(['service', 'add_on', 'discount']).default('service'),
  description: z.string().trim().min(1).max(2000),
  quantity: z.string().min(1),
  rate: z.string().min(1),
  optional: z.boolean().default(false),
  selected: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(10_000).default(0),
});

export const draftProposalFieldsSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  introduction: optionalText(20_000),
  projectOverview: optionalText(20_000),
  objectives: optionalText(20_000),
  scope: optionalText(20_000),
  deliverables: optionalText(20_000),
  timeline: optionalText(20_000),
  paymentSchedule: optionalText(20_000),
  termsAndConditions: optionalText(20_000),
  notes: optionalText(20_000),
  discount: z.string().default('0'),
  taxPercent: z.string().min(1),
  depositPercent: z.string().min(1),
  currency: z.enum(['CAD', 'USD']).default('CAD'),
  expiresAt: z
    .string()
    .optional()
    .transform((v) => {
      const t = v?.trim() || '';
      return t.length ? t : null;
    })
    .refine((v) => v == null || /^\d{4}-\d{2}-\d{2}/.test(v), {
      message: 'Use a valid expiration date',
    }),
  expectedUpdatedAt: z.string().min(1).max(64),
  itemsJson: z.string().min(2),
});

export function parseDraftProposalPayload(raw: Record<string, string>) {
  const base = draftProposalFieldsSchema.safeParse(raw);
  if (!base.success) {
    return { success: false as const, error: base.error.issues[0]?.message || 'Invalid proposal' };
  }

  let itemsRaw: unknown;
  try {
    itemsRaw = JSON.parse(base.data.itemsJson);
  } catch {
    return { success: false as const, error: 'Invalid line items payload' };
  }
  if (!Array.isArray(itemsRaw) || itemsRaw.length < 1) {
    return { success: false as const, error: 'Add at least one pricing line' };
  }

  const currency = base.data.currency as CurrencyCode;
  const lines: Array<{
    itemType: 'service' | 'add_on' | 'discount';
    description: string;
    quantityScaled: number;
    rateMinor: number;
    amountMinor: number;
    optional: boolean;
    selected: boolean;
    sortOrder: number;
  }> = [];

  for (const [index, entry] of itemsRaw.entries()) {
    const parsed = proposalItemInputSchema.safeParse({
      ...(typeof entry === 'object' && entry ? entry : {}),
      sortOrder:
        typeof entry === 'object' && entry && 'sortOrder' in entry
          ? Number((entry as { sortOrder?: number }).sortOrder ?? index)
          : index,
    });
    if (!parsed.success) {
      return {
        success: false as const,
        error: parsed.error.issues[0]?.message || `Invalid line item ${index + 1}`,
      };
    }
    const qty = parseQuantityToScaled(parsed.data.quantity);
    if (!qty.ok) return { success: false as const, error: qty.error };
    const rate = parseMajorToMinor(parsed.data.rate, currency);
    if (!rate.ok) return { success: false as const, error: rate.error };
    const amountMinor = lineAmountMinor(qty.scaled, rate.minor);
    lines.push({
      itemType: parsed.data.itemType,
      description: parsed.data.description,
      quantityScaled: qty.scaled,
      rateMinor: rate.minor,
      amountMinor,
      optional: parsed.data.optional,
      selected: parsed.data.selected,
      sortOrder: parsed.data.sortOrder,
    });
  }

  const discount = parseMajorToMinor(base.data.discount || '0', currency);
  if (!discount.ok) return { success: false as const, error: discount.error };
  const tax = percentInputToBps(base.data.taxPercent);
  if (!tax.ok) return { success: false as const, error: tax.error };
  if (tax.bps < 0 || tax.bps > 50_000) {
    return { success: false as const, error: 'Tax must be between 0% and 500%' };
  }
  const deposit = percentInputToBps(base.data.depositPercent);
  if (!deposit.ok) return { success: false as const, error: deposit.error };
  if (deposit.bps < 0 || deposit.bps > 10_000) {
    return { success: false as const, error: 'Deposit must be between 0% and 100%' };
  }

  const totals = calculateProposalTotals({
    lines: lines.map((line) => ({
      optional: line.optional,
      selected: line.selected,
      amountMinor: line.amountMinor,
    })),
    discountMinor: discount.minor,
    taxBps: tax.bps,
  });

  return {
    success: true as const,
    data: {
      title: base.data.title,
      introduction: base.data.introduction,
      projectOverview: base.data.projectOverview,
      objectives: base.data.objectives,
      scope: base.data.scope,
      deliverables: base.data.deliverables,
      timeline: base.data.timeline,
      paymentSchedule: base.data.paymentSchedule,
      termsAndConditions: base.data.termsAndConditions,
      notes: base.data.notes,
      currency,
      expiresAt: base.data.expiresAt,
      expectedUpdatedAt: base.data.expectedUpdatedAt,
      taxBps: tax.bps,
      depositBps: deposit.bps,
      lines,
      totals,
    },
  };
}

export const createProposalSchema = z.object({
  projectId: z.uuid('Select a project'),
  templateId: z
    .string()
    .optional()
    .transform((v) => {
      const t = v?.trim() || '';
      return t.length ? t : null;
    })
    .refine((v) => v == null || z.uuid().safeParse(v).success, {
      message: 'Invalid template',
    }),
  title: z.string().trim().min(1).max(200).optional(),
});

export const templateWriteSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: optionalText(2000),
  introduction: optionalText(20_000),
  projectOverview: optionalText(20_000),
  objectives: optionalText(20_000),
  scope: optionalText(20_000),
  deliverables: optionalText(20_000),
  timeline: optionalText(20_000),
  paymentTerms: optionalText(20_000),
  termsAndConditions: optionalText(20_000),
  notes: optionalText(20_000),
  makeDefault: z
    .string()
    .optional()
    .transform((v) => v === 'on' || v === 'true'),
});

export type TemplateWriteInput = z.infer<typeof templateWriteSchema>;

export const uuidParamSchema = z.uuid('Invalid id');

export const GENERIC_PROPOSAL_SAVE_ERROR = 'Unable to save proposal.';
export const GENERIC_PROPOSAL_LOAD_ERROR = 'Unable to load proposal.';
export const PROPOSAL_CONFLICT_ERROR =
  'This proposal was updated elsewhere. Refresh before saving.';
export const PROPOSAL_IMMUTABLE_ERROR = 'This version can no longer be edited.';
export const GENERIC_TEMPLATE_ERROR = 'Unable to save template.';
export const GENERIC_ARCHIVE_ERROR = 'Unable to archive proposal.';
export const GENERIC_REVISION_ERROR = 'Unable to create revision.';
export const GENERIC_FINALIZE_ERROR = 'Unable to finalize proposal version.';

export function formDataToObject(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === 'string') out[key] = value;
  }
  return out;
}

export type { ProposalStatus };

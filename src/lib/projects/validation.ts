import { z } from 'zod';
import { parseMajorToMinor, percentInputToBps } from '../money/parse';
import type { CurrencyCode } from '../supabase/domain';
import { PROJECT_STATUSES, type ProjectStatus } from './workflow';

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

const optionalDate = z
  .string()
  .optional()
  .transform((value) => {
    if (value == null) return null;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  })
  .refine((value) => value == null || /^\d{4}-\d{2}-\d{2}$/.test(value), {
    message: 'Use a valid date',
  });

export const projectStatusFilterSchema = z.enum([
  'all',
  'operational',
  ...PROJECT_STATUSES,
] as unknown as [string, ...string[]]);

export type ProjectStatusFilter = z.infer<typeof projectStatusFilterSchema>;

export const projectSortSchema = z.enum([
  'updated_desc',
  'created_desc',
  'name_asc',
  'target_date_asc',
  'value_desc',
  'value_asc',
]);
export type ProjectSort = z.infer<typeof projectSortSchema>;

export const projectListQuerySchema = z.object({
  q: z
    .string()
    .max(200)
    .optional()
    .transform((value) => value?.trim() || ''),
  status: z
    .string()
    .default('operational')
    .transform((value) => value || 'operational')
    .pipe(
      z.enum([
        'all',
        'operational',
        'inquiry',
        'proposal',
        'awaiting_approval',
        'deposit_due',
        'active',
        'awaiting_final_payment',
        'completed',
        'archived',
      ]),
    ),
  clientId: z
    .string()
    .optional()
    .transform((value) => {
      const trimmed = value?.trim() || '';
      return trimmed.length ? trimmed : null;
    })
    .refine((value) => value == null || z.uuid().safeParse(value).success, {
      message: 'Invalid client filter',
    }),
  sort: projectSortSchema.default('updated_desc'),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(25),
});

export type ProjectListQuery = z.infer<typeof projectListQuerySchema>;

const currencySchema = z.enum(['CAD', 'USD']);

function buildFinancialFields(raw: {
  projectPrice?: string;
  currency?: string;
  taxPercent?: string;
  depositPercent?: string;
}) {
  const currency = currencySchema.parse(raw.currency ?? 'CAD') as CurrencyCode;
  const price = parseMajorToMinor(String(raw.projectPrice ?? ''), currency);
  if (!price.ok) throw new Error(price.error);
  const tax = percentInputToBps(String(raw.taxPercent ?? '0'));
  if (!tax.ok) throw new Error(tax.error);
  if (tax.bps < 0 || tax.bps > 50_000) throw new Error('Tax must be between 0% and 500%');
  const deposit = percentInputToBps(String(raw.depositPercent ?? '50'));
  if (!deposit.ok) throw new Error(deposit.error);
  if (deposit.bps < 0 || deposit.bps > 10_000) {
    throw new Error('Deposit must be between 0% and 100%');
  }
  return {
    projectPriceMinor: price.minor,
    currency,
    taxBps: tax.bps,
    depositBps: deposit.bps,
  };
}

const projectFieldsBase = z.object({
  name: z.string().trim().min(1, 'Project name is required').max(200),
  clientId: z.uuid('Select a client'),
  projectType: optionalText(120),
  description: optionalText(5_000),
  scope: optionalText(20_000),
  deliverables: optionalText(20_000),
  startDate: optionalDate,
  targetCompletionDate: optionalDate,
  projectPrice: z.string().min(1, 'Enter a project price'),
  currency: currencySchema.default('CAD'),
  taxPercent: z.string().min(1, 'Enter a tax rate'),
  depositPercent: z.string().min(1, 'Enter a deposit percentage'),
  internalNotes: optionalText(10_000),
  expectedUpdatedAt: z.string().min(1).max(64).optional().nullable(),
});

export const createProjectSchema = projectFieldsBase
  .omit({ expectedUpdatedAt: true })
  .superRefine((value, ctx) => {
    if (
      value.startDate &&
      value.targetCompletionDate &&
      value.targetCompletionDate < value.startDate
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['targetCompletionDate'],
        message: 'Target completion cannot precede the start date',
      });
    }
    try {
      buildFinancialFields(value);
    } catch (error) {
      ctx.addIssue({
        code: 'custom',
        path: ['projectPrice'],
        message: error instanceof Error ? error.message : 'Invalid financial values',
      });
    }
  })
  .transform((value) => {
    const financial = buildFinancialFields(value);
    return {
      name: value.name,
      clientId: value.clientId,
      projectType: value.projectType,
      description: value.description,
      scope: value.scope,
      deliverables: value.deliverables,
      startDate: value.startDate,
      targetCompletionDate: value.targetCompletionDate,
      internalNotes: value.internalNotes,
      ...financial,
    };
  });

export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = projectFieldsBase.superRefine((value, ctx) => {
  if (
    value.startDate &&
    value.targetCompletionDate &&
    value.targetCompletionDate < value.startDate
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['targetCompletionDate'],
      message: 'Target completion cannot precede the start date',
    });
  }
  try {
    buildFinancialFields(value);
  } catch (error) {
    ctx.addIssue({
      code: 'custom',
      path: ['projectPrice'],
      message: error instanceof Error ? error.message : 'Invalid financial values',
    });
  }
}).transform((value) => {
  const financial = buildFinancialFields(value);
  return {
    name: value.name,
    clientId: value.clientId,
    projectType: value.projectType,
    description: value.description,
    scope: value.scope,
    deliverables: value.deliverables,
    startDate: value.startDate,
    targetCompletionDate: value.targetCompletionDate,
    internalNotes: value.internalNotes,
    expectedUpdatedAt: value.expectedUpdatedAt ?? null,
    ...financial,
  };
});

export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

export const transitionProjectSchema = z.object({
  targetStatus: z.enum(PROJECT_STATUSES as unknown as [ProjectStatus, ...ProjectStatus[]]),
  expectedStatus: z.enum(PROJECT_STATUSES as unknown as [ProjectStatus, ...ProjectStatus[]]),
});

export type TransitionProjectInput = z.infer<typeof transitionProjectSchema>;

export const uuidParamSchema = z.uuid('Invalid id');

export const PROJECT_TYPE_PRESETS = [
  'Brand Identity',
  'Web Design',
  'SEO',
  'Website Care',
  'Creative / Design',
  'Other',
] as const;

export const GENERIC_PROJECT_SAVE_ERROR = 'Unable to save project.';
export const GENERIC_PROJECT_LOAD_ERROR = 'Unable to load project.';
export const PROJECT_CONFLICT_ERROR =
  'This project was updated elsewhere. Refresh before saving your changes.';
export const PROJECT_TRANSITION_CONFLICT_ERROR =
  'This project status changed elsewhere. Refresh before continuing.';
export const GENERIC_TRANSITION_ERROR = 'Unable to update project status.';
export const GENERIC_ARCHIVE_ERROR = 'Unable to archive project.';
export const GENERIC_RESTORE_ERROR = 'Unable to restore project.';

export function formDataToObject(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === 'string') out[key] = value;
  }
  return out;
}

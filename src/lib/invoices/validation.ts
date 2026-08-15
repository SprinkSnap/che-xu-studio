import { z } from 'zod';
import { parseMajorToMinor, percentInputToBps } from '../money/parse';
import { parseQuantityToScaled, lineAmountMinor } from '../finance/calculations';
import { calculateManualInvoiceTotals } from '../finance/invoice-calculations';
import type { CurrencyCode } from '../supabase/domain';
import { INVOICE_TYPES } from './workflow';

export const INVOICE_CONFLICT_ERROR =
  'This invoice was updated elsewhere. Reload and try again.';
export const INVOICE_IMMUTABLE_ERROR = 'Issued invoices cannot change financial content.';
export const GENERIC_CREATE_ERROR = 'Unable to create invoice.';
export const GENERIC_SAVE_ERROR = 'Unable to save invoice.';
export const GENERIC_ISSUE_ERROR = 'Unable to issue invoice.';
export const GENERIC_VOID_ERROR = 'Unable to void invoice.';
export const GENERIC_GENERATE_ERROR = 'Unable to generate invoice.';

export const uuidParamSchema = z.string().uuid();

export const invoiceSortSchema = z.enum([
  'updated_desc',
  'created_desc',
  'number_asc',
  'due_asc',
  'total_desc',
  'balance_desc',
]);
export type InvoiceSort = z.infer<typeof invoiceSortSchema>;

export const invoiceListQuerySchema = z.object({
  q: z
    .string()
    .max(200)
    .optional()
    .transform((value) => value?.trim() || ''),
  status: z
    .string()
    .default('all')
    .transform((value) => value || 'all')
    .pipe(
      z.enum([
        'all',
        'draft',
        'issued',
        'sent',
        'partially_paid',
        'paid',
        'overdue',
        'void',
        'refunded',
      ]),
    ),
  type: z
    .string()
    .default('all')
    .transform((value) => value || 'all')
    .pipe(z.enum(['all', 'deposit', 'final', 'manual', 'adjustment'])),
  clientId: z
    .string()
    .optional()
    .transform((v) => {
      const t = v?.trim() || '';
      return t.length ? t : null;
    })
    .refine((v) => v == null || z.uuid().safeParse(v).success, { message: 'Invalid client filter' }),
  projectId: z
    .string()
    .optional()
    .transform((v) => {
      const t = v?.trim() || '';
      return t.length ? t : null;
    })
    .refine((v) => v == null || z.uuid().safeParse(v).success, {
      message: 'Invalid project filter',
    }),
  sort: invoiceSortSchema.default('updated_desc'),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(25),
});
export type InvoiceListQuery = z.infer<typeof invoiceListQuerySchema>;

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

export const invoiceItemInputSchema = z.object({
  id: z.string().uuid().optional(),
  description: z.string().trim().min(1).max(2000),
  quantity: z.string().min(1),
  rate: z.string().min(1),
  sortOrder: z.number().int().min(0).max(10_000).default(0),
});

export const createManualInvoiceSchema = z.object({
  clientId: z.string().uuid('Select a client'),
  projectId: z
    .string()
    .optional()
    .transform((v) => {
      const t = v?.trim() || '';
      return t.length ? t : null;
    })
    .refine((v) => v == null || z.uuid().safeParse(v).success, {
      message: 'Invalid project',
    }),
  invoiceType: z.enum(['manual']).default('manual'),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid issue date'),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid due date'),
  currency: z.enum(['CAD', 'USD']).default('CAD'),
  discount: z.string().default('0'),
  taxPercent: z.string().min(1),
  paymentInstructions: optionalText(10_000),
  itemsJson: z.string().min(2),
});

export const updateDraftInvoiceSchema = z.object({
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid issue date'),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid due date'),
  currency: z.enum(['CAD', 'USD']).default('CAD'),
  discount: z.string().default('0'),
  taxPercent: z.string().min(1),
  paymentInstructions: optionalText(10_000),
  expectedUpdatedAt: z.string().min(1).max(64),
  itemsJson: z.string().min(2),
});

export const generateFromProposalSchema = z.object({
  proposalId: z.string().uuid(),
  proposalVersionId: z.string().uuid().optional(),
});

export const issueInvoiceSchema = z.object({
  expectedUpdatedAt: z.string().min(1).max(64),
});

export const voidInvoiceSchema = z.object({
  expectedUpdatedAt: z.string().min(1).max(64),
});

export function formDataToObject(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === 'string') out[key] = value;
  }
  return out;
}

export type ParsedInvoiceItem = {
  description: string;
  quantityScaled: number;
  rateMinor: number;
  amountMinor: number;
  sortOrder: number;
};

function parseItemsJson(
  itemsJson: string,
  currency: CurrencyCode,
): { success: true; items: ParsedInvoiceItem[] } | { success: false; error: string } {
  let itemsRaw: unknown;
  try {
    itemsRaw = JSON.parse(itemsJson);
  } catch {
    return { success: false, error: 'Invalid line items payload' };
  }
  if (!Array.isArray(itemsRaw) || itemsRaw.length < 1) {
    return { success: false, error: 'Add at least one line item' };
  }

  const items: ParsedInvoiceItem[] = [];
  for (const [index, entry] of itemsRaw.entries()) {
    const parsed = invoiceItemInputSchema.safeParse({
      ...(typeof entry === 'object' && entry ? entry : {}),
      sortOrder:
        typeof entry === 'object' && entry && 'sortOrder' in entry
          ? Number((entry as { sortOrder?: number }).sortOrder ?? index)
          : index,
    });
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message || `Invalid line item ${index + 1}`,
      };
    }
    const qty = parseQuantityToScaled(parsed.data.quantity);
    if (!qty.ok) return { success: false, error: qty.error };
    const rate = parseMajorToMinor(parsed.data.rate, currency);
    if (!rate.ok) return { success: false, error: rate.error };
    items.push({
      description: parsed.data.description,
      quantityScaled: qty.scaled,
      rateMinor: rate.minor,
      amountMinor: lineAmountMinor(qty.scaled, rate.minor),
      sortOrder: parsed.data.sortOrder,
    });
  }
  return { success: true, items };
}

export function parseManualInvoiceCreatePayload(raw: Record<string, string>) {
  const base = createManualInvoiceSchema.safeParse(raw);
  if (!base.success) {
    return { success: false as const, error: base.error.issues[0]?.message || 'Invalid invoice' };
  }
  const currency = base.data.currency as CurrencyCode;
  const itemsResult = parseItemsJson(base.data.itemsJson, currency);
  if (!itemsResult.success) return itemsResult;

  const discount = parseMajorToMinor(base.data.discount || '0', currency);
  if (!discount.ok) return { success: false as const, error: discount.error };
  const tax = percentInputToBps(base.data.taxPercent);
  if (!tax.ok) return { success: false as const, error: tax.error };

  const totals = calculateManualInvoiceTotals({
    lines: itemsResult.items,
    discountMinor: discount.minor,
    taxBps: tax.bps,
  });

  if (base.data.dueDate < base.data.issueDate) {
    return { success: false as const, error: 'Due date cannot be before issue date' };
  }

  return {
    success: true as const,
    data: {
      clientId: base.data.clientId,
      projectId: base.data.projectId,
      invoiceType: 'manual' as const,
      issueDate: base.data.issueDate,
      dueDate: base.data.dueDate,
      currency,
      discountMinor: totals.discountMinor,
      taxBps: tax.bps,
      paymentInstructions: base.data.paymentInstructions,
      items: itemsResult.items,
      totals,
    },
  };
}

export function parseDraftInvoiceUpdatePayload(raw: Record<string, string>) {
  const base = updateDraftInvoiceSchema.safeParse(raw);
  if (!base.success) {
    return { success: false as const, error: base.error.issues[0]?.message || 'Invalid invoice' };
  }
  const currency = base.data.currency as CurrencyCode;
  const itemsResult = parseItemsJson(base.data.itemsJson, currency);
  if (!itemsResult.success) return itemsResult;

  const discount = parseMajorToMinor(base.data.discount || '0', currency);
  if (!discount.ok) return { success: false as const, error: discount.error };
  const tax = percentInputToBps(base.data.taxPercent);
  if (!tax.ok) return { success: false as const, error: tax.error };

  const totals = calculateManualInvoiceTotals({
    lines: itemsResult.items,
    discountMinor: discount.minor,
    taxBps: tax.bps,
  });

  if (base.data.dueDate < base.data.issueDate) {
    return { success: false as const, error: 'Due date cannot be before issue date' };
  }

  return {
    success: true as const,
    data: {
      issueDate: base.data.issueDate,
      dueDate: base.data.dueDate,
      currency,
      discountMinor: totals.discountMinor,
      taxBps: tax.bps,
      paymentInstructions: base.data.paymentInstructions,
      expectedUpdatedAt: base.data.expectedUpdatedAt,
      items: itemsResult.items,
      totals,
    },
  };
}

export function isKnownInvoiceType(value: string): value is (typeof INVOICE_TYPES)[number] {
  return (INVOICE_TYPES as readonly string[]).includes(value);
}

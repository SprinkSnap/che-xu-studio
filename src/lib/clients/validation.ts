import { z } from 'zod';

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

const optionalEmail = z
  .string()
  .max(254)
  .optional()
  .transform((value) => {
    if (value == null) return null;
    const trimmed = value.trim().toLowerCase();
    return trimmed.length ? trimmed : null;
  })
  .pipe(z.union([z.null(), z.email('Enter a valid email')]));

const optionalPhone = z
  .string()
  .max(40)
  .optional()
  .transform((value) => {
    if (value == null) return null;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  });

const countryCode = z
  .string()
  .max(2)
  .optional()
  .transform((value) => {
    if (value == null) return null;
    const trimmed = value.trim().toUpperCase();
    return trimmed.length ? trimmed : null;
  })
  .refine((value) => value == null || /^[A-Z]{2}$/.test(value), {
    message: 'Use a 2-letter country code',
  });

export const clientStatusFilterSchema = z.enum(['active', 'archived', 'all']);
export type ClientStatusFilter = z.infer<typeof clientStatusFilterSchema>;

export const clientSortSchema = z.enum([
  'updated_desc',
  'name_asc',
  'outstanding_desc',
  'lifetime_desc',
]);
export type ClientSort = z.infer<typeof clientSortSchema>;

export const clientListQuerySchema = z.object({
  q: z
    .string()
    .max(200)
    .optional()
    .transform((value) => value?.trim() || ''),
  status: clientStatusFilterSchema.default('active'),
  sort: clientSortSchema.default('updated_desc'),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(25),
});

export type ClientListQuery = z.infer<typeof clientListQuerySchema>;

export const clientWriteSchema = z.object({
  companyName: z
    .string()
    .trim()
    .min(1, 'Client name is required')
    .max(200, 'Client name is too long'),
  displayName: optionalText(200),
  billingEmail: optionalEmail,
  phone: optionalPhone,
  billingAddressLine1: optionalText(200),
  billingAddressLine2: optionalText(200),
  billingCity: optionalText(120),
  billingRegion: optionalText(120),
  billingPostalCode: optionalText(30),
  billingCountry: countryCode,
  companySameAsBilling: z
    .union([z.literal('on'), z.literal('true'), z.literal('1'), z.boolean()])
    .optional()
    .transform((value) => value === true || value === 'on' || value === 'true' || value === '1'),
  companyAddressLine1: optionalText(200),
  companyAddressLine2: optionalText(200),
  companyCity: optionalText(120),
  companyRegion: optionalText(120),
  companyPostalCode: optionalText(30),
  companyCountry: countryCode,
  notes: optionalText(10_000),
  expectedUpdatedAt: z.string().min(1).max(64).optional().nullable(),
});

export type ClientWriteInput = z.infer<typeof clientWriteSchema>;

export const primaryContactWriteSchema = z.object({
  contactName: z.string().trim().min(1, 'Contact name is required').max(200),
  contactEmail: optionalEmail,
  contactPhone: optionalPhone,
  contactJobTitle: optionalText(120),
});

export type PrimaryContactWriteInput = z.infer<typeof primaryContactWriteSchema>;

export const createClientSchema = z.object({
  ...clientWriteSchema.omit({ expectedUpdatedAt: true }).shape,
  ...primaryContactWriteSchema.shape,
});

export type CreateClientInput = z.infer<typeof createClientSchema>;

export const contactWriteSchema = z.object({
  name: z.string().trim().min(1, 'Contact name is required').max(200),
  email: optionalEmail,
  phone: optionalPhone,
  jobTitle: optionalText(120),
  setPrimary: z
    .union([z.literal('on'), z.literal('true'), z.literal('1'), z.boolean()])
    .optional()
    .transform((value) => value === true || value === 'on' || value === 'true' || value === '1'),
});

export type ContactWriteInput = z.infer<typeof contactWriteSchema>;

export const uuidParamSchema = z.uuid('Invalid id');

export const GENERIC_CLIENT_SAVE_ERROR = 'Unable to save client.';
export const GENERIC_CLIENT_LOAD_ERROR = 'Unable to load client.';
export const CLIENT_CONFLICT_ERROR =
  'This client was updated elsewhere. Refresh before saving your changes.';
export const GENERIC_CONTACT_ERROR = 'Unable to update contact.';
export const GENERIC_ARCHIVE_ERROR = 'Unable to archive client.';
export const GENERIC_RESTORE_ERROR = 'Unable to restore client.';

/** Apply company-same-as-billing before persistence. */
export function resolveCompanyAddress<T extends ClientWriteInput | CreateClientInput>(
  input: T,
): T {
  if (!input.companySameAsBilling) return input;
  return {
    ...input,
    companyAddressLine1: input.billingAddressLine1,
    companyAddressLine2: input.billingAddressLine2,
    companyCity: input.billingCity,
    companyRegion: input.billingRegion,
    companyPostalCode: input.billingPostalCode,
    companyCountry: input.billingCountry,
  };
}

export function formDataToObject(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === 'string') out[key] = value;
  }
  return out;
}

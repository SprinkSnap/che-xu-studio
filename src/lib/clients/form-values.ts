/**
 * Shared client form field markup helpers for Astro pages.
 * Values are escaped by Astro when passed as props into templates.
 */

export type ClientFormValues = {
  companyName: string;
  displayName: string;
  billingEmail: string;
  phone: string;
  billingAddressLine1: string;
  billingAddressLine2: string;
  billingCity: string;
  billingRegion: string;
  billingPostalCode: string;
  billingCountry: string;
  companySameAsBilling: boolean;
  companyAddressLine1: string;
  companyAddressLine2: string;
  companyCity: string;
  companyRegion: string;
  companyPostalCode: string;
  companyCountry: string;
  notes: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  contactJobTitle?: string;
  expectedUpdatedAt?: string;
};

export function emptyClientFormValues(): ClientFormValues {
  return {
    companyName: '',
    displayName: '',
    billingEmail: '',
    phone: '',
    billingAddressLine1: '',
    billingAddressLine2: '',
    billingCity: '',
    billingRegion: '',
    billingPostalCode: '',
    billingCountry: 'CA',
    companySameAsBilling: true,
    companyAddressLine1: '',
    companyAddressLine2: '',
    companyCity: '',
    companyRegion: '',
    companyPostalCode: '',
    companyCountry: 'CA',
    notes: '',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    contactJobTitle: '',
  };
}

export function clientRowToFormValues(client: {
  company_name: string;
  display_name: string | null;
  billing_email: string | null;
  phone: string | null;
  billing_address_line1: string | null;
  billing_address_line2: string | null;
  billing_city: string | null;
  billing_region: string | null;
  billing_postal_code: string | null;
  billing_country: string | null;
  company_address_line1: string | null;
  company_address_line2: string | null;
  company_city: string | null;
  company_region: string | null;
  company_postal_code: string | null;
  company_country: string | null;
  notes: string | null;
  updated_at: string;
}): ClientFormValues {
  const sameAsBilling =
    (client.company_address_line1 ?? '') === (client.billing_address_line1 ?? '') &&
    (client.company_address_line2 ?? '') === (client.billing_address_line2 ?? '') &&
    (client.company_city ?? '') === (client.billing_city ?? '') &&
    (client.company_region ?? '') === (client.billing_region ?? '') &&
    (client.company_postal_code ?? '') === (client.billing_postal_code ?? '') &&
    (client.company_country ?? '') === (client.billing_country ?? '');

  return {
    companyName: client.company_name,
    displayName: client.display_name ?? '',
    billingEmail: client.billing_email ?? '',
    phone: client.phone ?? '',
    billingAddressLine1: client.billing_address_line1 ?? '',
    billingAddressLine2: client.billing_address_line2 ?? '',
    billingCity: client.billing_city ?? '',
    billingRegion: client.billing_region ?? '',
    billingPostalCode: client.billing_postal_code ?? '',
    billingCountry: client.billing_country ?? 'CA',
    companySameAsBilling: sameAsBilling,
    companyAddressLine1: client.company_address_line1 ?? '',
    companyAddressLine2: client.company_address_line2 ?? '',
    companyCity: client.company_city ?? '',
    companyRegion: client.company_region ?? '',
    companyPostalCode: client.company_postal_code ?? '',
    companyCountry: client.company_country ?? 'CA',
    notes: client.notes ?? '',
    expectedUpdatedAt: client.updated_at,
  };
}

import { describe, expect, it } from 'vitest';
import { formatMoney } from '../../src/lib/clients/format';
import { resolveCompanyAddress, createClientSchema, clientListQuerySchema, clientWriteSchema, uuidParamSchema } from '../../src/lib/clients/validation';
import { humanizeStudioActivity } from '../../src/lib/studio/activity';
import { roleHasPermission } from '../../src/lib/auth/permissions';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

describe('client validation', () => {
  it('accepts a valid create payload', () => {
    const parsed = createClientSchema.safeParse({
      companyName: 'Northline Co',
      contactName: 'Alex Riv',
      contactEmail: 'alex@example.com',
      billingCountry: 'ca',
      companySameAsBilling: 'on',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.billingCountry).toBe('CA');
      expect(parsed.data.companySameAsBilling).toBe(true);
    }
  });

  it('rejects empty client name and invalid email', () => {
    expect(createClientSchema.safeParse({ companyName: ' ', contactName: 'A' }).success).toBe(
      false,
    );
    expect(
      createClientSchema.safeParse({
        companyName: 'Acme',
        contactName: 'A',
        contactEmail: 'not-an-email',
      }).success,
    ).toBe(false);
  });

  it('copies billing into company address when requested', () => {
    const resolved = resolveCompanyAddress({
      companyName: 'Acme',
      displayName: null,
      billingEmail: null,
      phone: null,
      billingAddressLine1: '1 Main',
      billingAddressLine2: null,
      billingCity: 'Toronto',
      billingRegion: 'ON',
      billingPostalCode: 'M5V1A1',
      billingCountry: 'CA',
      companySameAsBilling: true,
      companyAddressLine1: null,
      companyAddressLine2: null,
      companyCity: null,
      companyRegion: null,
      companyPostalCode: null,
      companyCountry: null,
      notes: null,
      contactName: 'A',
      contactEmail: null,
      contactPhone: null,
      contactJobTitle: null,
    });
    expect(resolved.companyAddressLine1).toBe('1 Main');
    expect(resolved.companyCity).toBe('Toronto');
    expect(resolved.companyCountry).toBe('CA');
  });

  it('clamps list query params and whitelists sort/status', () => {
    const parsed = clientListQuerySchema.parse({
      q: '  acme ',
      status: 'archived',
      sort: 'lifetime_desc',
      page: '2',
      pageSize: '25',
    });
    expect(parsed.q).toBe('acme');
    expect(parsed.status).toBe('archived');
    expect(parsed.sort).toBe('lifetime_desc');
    expect(parsed.page).toBe(2);
    expect(clientListQuerySchema.safeParse({ sort: 'drop table' }).success).toBe(false);
    expect(uuidParamSchema.safeParse('not-a-uuid').success).toBe(false);
  });

  it('rejects overlong notes', () => {
    expect(
      clientWriteSchema.safeParse({
        companyName: 'Acme',
        notes: 'x'.repeat(10_001),
      }).success,
    ).toBe(false);
  });
});

describe('client money + activity helpers', () => {
  it('formats minor units with Intl currency', () => {
    expect(formatMoney(400000, 'CAD')).toMatch(/\$4,000\.00/);
  });

  it('humanizes client activity actions', () => {
    expect(humanizeStudioActivity('client.created')).toBe('Client created');
    expect(humanizeStudioActivity('client.primary_contact_changed')).toBe(
      'Primary contact changed',
    );
  });
});

describe('client permissions', () => {
  it('grants read/write to owner admin and staff', () => {
    for (const role of ['owner', 'admin', 'staff'] as const) {
      expect(roleHasPermission(role, 'studio.clients.read')).toBe(true);
      expect(roleHasPermission(role, 'studio.clients.write')).toBe(true);
    }
  });
});

describe('client management migration', () => {
  it('ships RPC helpers and safe financial summary', () => {
    const dir = path.join(process.cwd(), 'supabase/migrations');
    const files = readdirSync(dir).filter((name) => name.endsWith('.sql')).sort();
    expect(files).toContain('202608140009_client_management_helpers.sql');
    const sql = readFileSync(path.join(dir, '202608140009_client_management_helpers.sql'), 'utf8');
    expect(sql).toMatch(/create_client_with_primary_contact/);
    expect(sql).toMatch(/set_primary_client_contact/);
    expect(sql).toMatch(/SECURITY INVOKER/);
    expect(sql).toMatch(/lifetime_paid_minor/);
    expect(sql).toMatch(/scalar subqueries|SELECT sum\(p\.amount_minor - p\.refunded_minor\)/i);
  });
});

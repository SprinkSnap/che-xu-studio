import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { bpsToPercent, percentToBps, formatMinorUnits } from '../../src/lib/supabase/domain';
import type { Database } from '../../src/lib/supabase/database.types';

const migrationsDir = path.join(process.cwd(), 'supabase/migrations');

describe('studio phase 4 migrations', () => {
  const files = readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  it('ships the expected ordered migration set', () => {
    expect(files).toEqual([
      '202608140001_core_identity.sql',
      '202608140002_clients_projects.sql',
      '202608140003_proposals.sql',
      '202608140004_invoices_payments.sql',
      '202608140005_operations.sql',
      '202608140006_immutability.sql',
      '202608140007_rls.sql',
      '202608140008_profile_privilege_guards.sql',
      '202608140009_client_management_helpers.sql',
      '202608140010_project_workflow_helpers.sql',
      '202608140011_proposal_management_helpers.sql',
      '202608140012_invoice_management_helpers.sql',
      '202608140013_proposal_public_acceptance.sql',
      '202608140014_stripe_payment_helpers.sql',
      '202608140015_email_outbox_reminders.sql',
      '202608140016_document_generation.sql',
    ]);
  });

  it('ships document generation status, jobs, and private storage guards', () => {
    const sql = readFileSync(
      path.join(migrationsDir, '202608140016_document_generation.sql'),
      'utf8',
    );
    expect(sql).toMatch(/document_jobs/);
    expect(sql).toMatch(/documents_canonical_unique_idx/);
    expect(sql).toMatch(/studio-documents/);
    expect(sql).toMatch(/to_regclass\('storage\.buckets'\)/);
    expect(sql).toMatch(/is_canonical/);
    expect(sql).toMatch(/renderer_version/);
  });

  it('ships atomic project transition helpers', () => {
    const helpers = readFileSync(
      path.join(migrationsDir, '202608140010_project_workflow_helpers.sql'),
      'utf8',
    );
    expect(helpers).toMatch(/transition_project/);
    expect(helpers).toMatch(/status_before_archive/);
    expect(helpers).toMatch(/SECURITY INVOKER/);
    expect(helpers).toMatch(/project status conflict/);
  });

  it('ships proposal management helpers without faking sent', () => {
    const helpers = readFileSync(
      path.join(migrationsDir, '202608140011_proposal_management_helpers.sql'),
      'utf8',
    );
    expect(helpers).toMatch(/finalize_proposal_version/);
    expect(helpers).toMatch(/create_proposal_revision/);
    expect(helpers).toMatch(/finalized_at/);
    expect(helpers).toMatch(/Parent stays draft/);
  });

  it('blocks profile self-promotion and open self-enrollment', () => {
    const guards = readFileSync(
      path.join(migrationsDir, '202608140008_profile_privilege_guards.sql'),
      'utf8',
    );
    expect(guards).toMatch(/prevent_profile_privilege_escalation/);
    expect(guards).toMatch(/cannot change role/);
    expect(guards).toMatch(/is_studio_admin\(\)/);
    // Insert policy must require admin — no self-enrollment clause on INSERT.
    expect(guards).toMatch(
      /profiles_admin_insert[\s\S]*WITH CHECK \(public\.is_studio_admin\(\)\)/,
    );
  });

  it('enables RLS and avoids anonymous true policies', () => {
    const rls = readFileSync(path.join(migrationsDir, '202608140007_rls.sql'), 'utf8');
    expect(rls).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(rls).toMatch(/is_studio_user\(\)/);
    expect(rls).not.toMatch(/TO anon[\s\S]*USING\s*\(\s*true\s*\)/i);
    expect(rls).toMatch(/SET search_path = public/);
  });

  it('stores public link hashes and forbids float money types', () => {
    const all = files.map((file) => readFileSync(path.join(migrationsDir, file), 'utf8')).join('\n');
    expect(all).toMatch(/token_hash/);
    expect(all).toMatch(/never plaintext tokens/i);
    expect(all).not.toMatch(/\bdouble precision\b/);
    expect(all).not.toMatch(/amount_minor (double|real|float)/i);
    expect(all).toMatch(/deposit_bps/);
    expect(all).toMatch(/next_document_number/);
  });

  it('protects financial history with restrict/immutability', () => {
    const all = files.map((file) => readFileSync(path.join(migrationsDir, file), 'utf8')).join('\n');
    expect(all).toMatch(/ON DELETE RESTRICT/);
    expect(all).toMatch(/is_immutable/);
    expect(all).toMatch(/financial snapshot/);
  });
});

describe('studio domain money helpers', () => {
  it('converts basis points exactly', () => {
    expect(percentToBps(50)).toBe(5000);
    expect(bpsToPercent(1300)).toBe(13);
  });

  it('formats minor units without implying float persistence', () => {
    expect(formatMinorUnits(800000, 'CAD')).toMatch(/8,000/);
  });
});

describe('generated database types', () => {
  it('includes core Studio tables and enums', () => {
    type ProjectStatus = Database['public']['Enums']['project_status'];
    const status: ProjectStatus = 'deposit_due';
    expect(status).toBe('deposit_due');
    expect(typeof status).toBe('string');
  });
});

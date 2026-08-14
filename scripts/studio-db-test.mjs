#!/usr/bin/env node
/**
 * Apply Studio Postgres migrations to a local database and run constraint/RLS checks.
 * Does not require Docker/Supabase CLI — uses system PostgreSQL when available.
 *
 * Env:
 *   STUDIO_PG_URL (default: postgres://postgres@localhost/studio_os_phase4_test)
 */
import { spawnSync } from 'node:child_process';
import { readdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const ROOT = process.cwd();
const DB_NAME = 'studio_os_phase4_test';

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    ...opts,
  });
  if (result.status !== 0) {
    const err = (result.stderr || result.stdout || '').trim();
    throw new Error(`${cmd} ${args.join(' ')} failed:\n${err}`);
  }
  return result.stdout;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function main() {
  // Recreate database as postgres OS user via peer auth.
  run('sudo', ['-u', 'postgres', 'psql', '-c', `DROP DATABASE IF EXISTS ${DB_NAME};`]);
  run('sudo', ['-u', 'postgres', 'psql', '-c', `CREATE DATABASE ${DB_NAME};`]);
  // Allow local ubuntu peer/trust connections by using sudo -u postgres for all SQL.
  const adminUrl = `postgres:///${DB_NAME}?host=/var/run/postgresql`;

  const adminPsql = (sql) =>
    run('sudo', [
      '-u',
      'postgres',
      'psql',
      adminUrl,
      '-v',
      'ON_ERROR_STOP=1',
      '-q',
      '-At',
      '-c',
      sql,
    ]).trim();
  const adminPsqlFile = (file) =>
    run('sudo', ['-u', 'postgres', 'psql', adminUrl, '-v', 'ON_ERROR_STOP=1', '-f', file]);

  adminPsqlFile(path.join(ROOT, 'scripts/sql/auth-stub.sql'));

  const migrationsDir = path.join(ROOT, 'supabase/migrations');
  const files = readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort();
  assert(files.length >= 8, 'Expected Phase 4+ migration SQL files (incl. Phase 5 privilege guards)');

  for (const file of files) {
    adminPsqlFile(path.join(migrationsDir, file));
  }

  // --- Numbering ---
  const n1 = adminPsql(`SELECT public.next_document_number('invoice', 'CXS', 2026);`).trim();
  const n2 = adminPsql(`SELECT public.next_document_number('invoice', 'CXS', 2026);`).trim();
  const n3 = adminPsql(`SELECT public.next_document_number('invoice', 'CXS', 2027);`).trim();
  const p1 = adminPsql(`SELECT public.next_document_number('proposal', 'CXS-P', 2026);`).trim();
  assert(n1 === 'CXS-2026-001', `Expected CXS-2026-001 got ${n1}`);
  assert(n2 === 'CXS-2026-002', `Expected CXS-2026-002 got ${n2}`);
  assert(n3 === 'CXS-2027-001', `Expected CXS-2027-001 got ${n3}`);
  assert(p1 === 'CXS-P-2026-001', `Expected CXS-P-2026-001 got ${p1}`);
  assert(n1 !== p1, 'Invoice and proposal counters must not collide');

  // --- Seed identity + client/project ---
  const ownerAuth = adminPsql(`SELECT gen_random_uuid();`).trim();
  const outsiderAuth = adminPsql(`SELECT gen_random_uuid();`).trim();
  const suspendedAuth = adminPsql(`SELECT gen_random_uuid();`).trim();
  adminPsql(`INSERT INTO auth.users (id, email) VALUES ('${ownerAuth}', 'owner@chexustudio.com');`);
  adminPsql(`INSERT INTO auth.users (id, email) VALUES ('${outsiderAuth}', 'outsider@example.com');`);
  adminPsql(`INSERT INTO auth.users (id, email) VALUES ('${suspendedAuth}', 'suspended@chexustudio.com');`);

  const ownerProfile = adminPsql(`
    INSERT INTO public.profiles (auth_user_id, email, role, status, display_name)
    VALUES ('${ownerAuth}', 'owner@chexustudio.com', 'owner', 'active', 'Owner')
    RETURNING id;
  `).trim();
  adminPsql(`
    INSERT INTO public.profiles (auth_user_id, email, role, status, display_name)
    VALUES ('${suspendedAuth}', 'suspended@chexustudio.com', 'staff', 'suspended', 'Suspended');
  `);

  const clientId = adminPsql(`
    INSERT INTO public.clients (company_name, billing_email)
    VALUES ('Northline Demo Co', 'billing@example.com')
    RETURNING id;
  `).trim();

  adminPsql(`
    INSERT INTO public.client_contacts (client_id, name, email, is_primary)
    VALUES ('${clientId}', 'Primary Contact', 'primary@example.com', true);
  `);

  // Duplicate primary contact should fail
  const dupPrimarySql = `
    INSERT INTO public.client_contacts (client_id, name, email, is_primary)
    VALUES ('${clientId}', 'Second Primary', 'second@example.com', true);
  `;
  try {
    adminPsql(dupPrimarySql);
    throw new Error('duplicate primary contact should fail');
  } catch (err) {
    assert(/unique|client_contacts_one_primary/i.test(String(err)), String(err));
  }

  // Deposit > 100% should fail
  try {
    adminPsql(`
      INSERT INTO public.projects (client_id, name, deposit_bps)
      VALUES ('${clientId}', 'Bad Deposit', 10001);
    `);
    throw new Error('deposit_bps > 10000 should fail');
  } catch (err) {
    assert(/deposit_bps|check/i.test(String(err)), String(err));
  }

  const projectId = adminPsql(`
    INSERT INTO public.projects (client_id, name, project_price_minor, deposit_bps, tax_bps, currency)
    VALUES ('${clientId}', 'Brand Site', 800000, 5000, 1300, 'CAD')
    RETURNING id;
  `).trim();

  const proposalNumber = adminPsql(`SELECT public.next_document_number('proposal', 'CXS-P', 2026);`).trim();
  const proposalId = adminPsql(`
    INSERT INTO public.proposals (client_id, project_id, proposal_number, title, status, created_by)
    VALUES ('${clientId}', '${projectId}', '${proposalNumber}', 'Website Proposal', 'draft', '${ownerProfile}')
    RETURNING id;
  `).trim();

  const versionId = adminPsql(`
    INSERT INTO public.proposal_versions (
      proposal_id, version_number, title, subtotal_minor, tax_minor, total_minor, currency
    ) VALUES ('${proposalId}', 1, 'Website Proposal v1', 800000, 104000, 904000, 'CAD')
    RETURNING id;
  `).trim();

  adminPsql(`UPDATE public.proposals SET current_version_id = '${versionId}' WHERE id = '${proposalId}';`);
  adminPsql(`
    INSERT INTO public.proposal_items (proposal_version_id, description, quantity, rate_minor, amount_minor)
    VALUES ('${versionId}', 'Custom website', 1, 800000, 800000);
  `);

  // Lock by sending
  adminPsql(`UPDATE public.proposals SET status = 'sent', sent_at = now() WHERE id = '${proposalId}';`);
  const immutable = adminPsql(`SELECT is_immutable FROM public.proposal_versions WHERE id = '${versionId}';`).trim();
  assert(immutable === 't', 'sent proposal version must become immutable');

  try {
    adminPsql(`UPDATE public.proposal_versions SET title = 'Tampered' WHERE id = '${versionId}';`);
    throw new Error('immutable version update should fail');
  } catch (err) {
    assert(/immutable/i.test(String(err)), String(err));
  }

  try {
    adminPsql(`
      INSERT INTO public.proposal_items (proposal_version_id, description, quantity, rate_minor, amount_minor)
      VALUES ('${versionId}', 'Tamper item', 1, 1, 1);
    `);
    throw new Error('immutable version item insert should fail');
  } catch (err) {
    assert(/immutable/i.test(String(err)), String(err));
  }

  // Invoice snapshot immutability
  const invoiceNumber = adminPsql(`SELECT public.next_document_number('invoice', 'CXS', 2026);`).trim();
  const invoiceId = adminPsql(`
    INSERT INTO public.invoices (
      client_id, project_id, proposal_id, invoice_number, invoice_type, status,
      currency, issue_date, due_date, subtotal_minor, tax_minor, total_minor,
      amount_paid_minor, balance_due_minor, created_by
    ) VALUES (
      '${clientId}', '${projectId}', '${proposalId}', '${invoiceNumber}', 'deposit', 'draft',
      'CAD', CURRENT_DATE, CURRENT_DATE + 14, 400000, 52000, 452000,
      0, 452000, '${ownerProfile}'
    ) RETURNING id;
  `).trim();

  adminPsql(`
    INSERT INTO public.invoice_items (invoice_id, description, quantity, rate_minor, amount_minor)
    VALUES ('${invoiceId}', 'Deposit 50%', 1, 400000, 400000);
  `);

  adminPsql(`UPDATE public.invoices SET status = 'issued', issue_date = CURRENT_DATE WHERE id = '${invoiceId}';`);

  try {
    adminPsql(`UPDATE public.invoices SET total_minor = 1, balance_due_minor = 1 WHERE id = '${invoiceId}';`);
    throw new Error('issued invoice financial update should fail');
  } catch (err) {
    assert(/financial snapshot|non-draft/i.test(String(err)), String(err));
  }

  // Payment fields remain mutable
  adminPsql(`
    UPDATE public.invoices
    SET amount_paid_minor = 452000, balance_due_minor = 0, status = 'paid', paid_at = now()
    WHERE id = '${invoiceId}';
  `);

  try {
    adminPsql(`DELETE FROM public.invoices WHERE id = '${invoiceId}';`);
    throw new Error('non-draft invoice delete should fail');
  } catch (err) {
    assert(/non-draft invoices cannot be deleted/i.test(String(err)), String(err));
  }

  // Negative totals rejected
  try {
    adminPsql(`
      INSERT INTO public.invoices (
        client_id, invoice_number, total_minor, amount_paid_minor, balance_due_minor
      ) VALUES ('${clientId}', 'BAD-NEG', -1, 0, -1);
    `);
    throw new Error('negative totals should fail');
  } catch (err) {
    assert(/check|money|non_negative|balance/i.test(String(err)), String(err));
  }

  // Webhook uniqueness
  adminPsql(`
    INSERT INTO public.webhook_events (provider, provider_event_id, event_type)
    VALUES ('stripe', 'evt_test_1', 'checkout.session.completed');
  `);
  try {
    adminPsql(`
      INSERT INTO public.webhook_events (provider, provider_event_id, event_type)
      VALUES ('stripe', 'evt_test_1', 'checkout.session.completed');
    `);
    throw new Error('duplicate webhook event should fail');
  } catch (err) {
    assert(/unique|webhook_events_provider_event/i.test(String(err)), String(err));
  }

  // --- RLS ---
  const asRole = (role, jwtSub, sql) => {
    const tmp = mkdtempSync(path.join(tmpdir(), 'studio-rls-'));
    // Ensure the postgres OS user can read the temp SQL file.
    run('chmod', ['755', tmp]);
    const file = path.join(tmp, 'q.sql');
    writeFileSync(
      file,
      `BEGIN;
SELECT set_config('request.jwt.claim.sub', '${jwtSub}', true);
SET LOCAL ROLE ${role};
${sql}
ROLLBACK;
`,
      { mode: 0o644 },
    );
    run('chmod', ['644', file]);
    try {
      const out = run('sudo', [
        '-u',
        'postgres',
        'psql',
        adminUrl,
        '-v',
        'ON_ERROR_STOP=1',
        '-q',
        '-At',
        '-f',
        file,
      ]).trim();
      // set_config returns a value; take the last non-empty line as the query result.
      const lines = out.split('\n').map((line) => line.trim()).filter(Boolean);
      return lines.at(-1) || '';
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  };

  // Anonymous cannot read clients
  try {
    asRole('anon', '', `SELECT count(*) FROM public.clients;`);
    // With RLS and no policy, SELECT returns 0 rows rather than error in some setups;
    // assert zero rows if it succeeds.
  } catch {
    // denied is also acceptable
  }
  const anonCount = (() => {
    try {
      return asRole('anon', '', `SELECT count(*)::text FROM public.clients;`).trim();
    } catch {
      return 'denied';
    }
  })();
  assert(anonCount === '0' || anonCount === 'denied', `anon should not see clients, got ${anonCount}`);

  // Outsider authenticated non-member
  const outsiderCount = asRole(
    'authenticated',
    outsiderAuth,
    `SELECT count(*)::text FROM public.clients;`,
  ).trim();
  assert(outsiderCount === '0', `non-member should see 0 clients, got ${outsiderCount}`);

  // Suspended member
  const suspendedCount = asRole(
    'authenticated',
    suspendedAuth,
    `SELECT count(*)::text FROM public.clients;`,
  ).trim();
  assert(suspendedCount === '0', `suspended member should see 0 clients, got ${suspendedCount}`);

  // Active owner
  const ownerCount = asRole(
    'authenticated',
    ownerAuth,
    `SELECT count(*)::text FROM public.clients;`,
  ).trim();
  assert(ownerCount === '1', `owner should see clients, got ${ownerCount}`);

  // --- Phase 5: profile self-promotion / self-enrollment must fail ---
  const staffAuth = adminPsql(`SELECT gen_random_uuid();`).trim();
  adminPsql(`INSERT INTO auth.users (id, email) VALUES ('${staffAuth}', 'staff@chexustudio.com');`);
  const staffProfile = adminPsql(`
    INSERT INTO public.profiles (auth_user_id, email, role, status, display_name)
    VALUES ('${staffAuth}', 'staff@chexustudio.com', 'staff', 'active', 'Staff')
    RETURNING id;
  `).trim();

  let staffPromoted = 'ok';
  try {
    asRole(
      'authenticated',
      staffAuth,
      `UPDATE public.profiles SET role = 'owner' WHERE id = '${staffProfile}';`,
    );
  } catch {
    staffPromoted = 'denied';
  }
  assert(staffPromoted === 'denied', 'staff must not self-promote to owner');

  const staffRole = adminPsql(`SELECT role::text FROM public.profiles WHERE id = '${staffProfile}';`).trim();
  assert(staffRole === 'staff', `staff role must remain staff, got ${staffRole}`);

  let outsiderInserted = 'ok';
  try {
    asRole(
      'authenticated',
      outsiderAuth,
      `INSERT INTO public.profiles (auth_user_id, email, role, status)
       VALUES ('${outsiderAuth}', 'outsider@example.com', 'owner', 'active');`,
    );
  } catch {
    outsiderInserted = 'denied';
  }
  assert(outsiderInserted === 'denied', 'non-member must not self-insert an owner profile');

  // Staff may still update their own display_name
  asRole(
    'authenticated',
    staffAuth,
    `UPDATE public.profiles SET display_name = 'Staff Updated' WHERE id = '${staffProfile}';`,
  );
  const staffName = adminPsql(`SELECT display_name FROM public.profiles WHERE id = '${staffProfile}';`).trim();
  assert(staffName === 'Staff Updated', `staff should update display_name, got ${staffName}`);

  // Table inventory
  const tableCount = adminPsql(`
    SELECT count(*) FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      AND table_name IN (
        'profiles','clients','client_contacts','projects','proposal_templates','proposals',
        'proposal_versions','proposal_items','proposal_acceptances','public_links','invoices',
        'invoice_items','payments','refunds','documents','email_logs','reminder_events',
        'activity_logs','settings','number_counters','webhook_events'
      );
  `).trim();
  assert(tableCount === '21', `Expected 21 Studio tables, got ${tableCount}`);

  // RLS enabled on all
  const rlsOff = adminPsql(`
    SELECT relname FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname IN (
        'profiles','clients','client_contacts','projects','proposal_templates','proposals',
        'proposal_versions','proposal_items','proposal_acceptances','public_links','invoices',
        'invoice_items','payments','refunds','documents','email_logs','reminder_events',
        'activity_logs','settings','number_counters','webhook_events'
      )
      AND NOT c.relrowsecurity;
  `).trim();
  assert(rlsOff === '', `RLS disabled on: ${rlsOff || '(none)'}`);

  console.log('[studio-db-test] OK — migrations applied; numbering, immutability, constraints, and RLS checks passed.');
}

try {
  main();
} catch (err) {
  console.error('[studio-db-test] FAILED');
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}

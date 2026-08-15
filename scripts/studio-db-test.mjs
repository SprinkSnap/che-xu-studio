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
  assert(files.length >= 9, 'Expected Phase 4+ migration SQL files (incl. client management helpers)');

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

  /** Like asRole but COMMITs — needed when later assertions depend on prior writes. */
  const asRoleCommit = (role, jwtSub, sql) => {
    const tmp = mkdtempSync(path.join(tmpdir(), 'studio-rls-c-'));
    run('chmod', ['755', tmp]);
    const file = path.join(tmp, 'q.sql');
    writeFileSync(
      file,
      `BEGIN;
SELECT set_config('request.jwt.claim.sub', '${jwtSub}', true);
SET LOCAL ROLE ${role};
${sql}
COMMIT;
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

  // Staff may still update their own display_name (verified inside the RLS transaction)
  const staffName = asRole(
    'authenticated',
    staffAuth,
    `UPDATE public.profiles SET display_name = 'Staff Updated' WHERE id = '${staffProfile}';
     SELECT display_name FROM public.profiles WHERE id = '${staffProfile}';`,
  ).trim();
  assert(staffName === 'Staff Updated', `staff should update display_name, got ${staffName}`);

  // --- Phase 6: client RPCs + financial summary net of refunds ---
  // asRole wraps BEGIN/ROLLBACK — assert create+primary in one transaction.
  const createdBundle = asRole(
    'authenticated',
    ownerAuth,
    `CREATE TEMP TABLE _phase6_client ON COMMIT DROP AS
       SELECT public.create_client_with_primary_contact(
         'Phase6 Co',
         'Pat Primary'
       ) AS client_id;
     SELECT count(*)::text
     FROM public.client_contacts c
     JOIN _phase6_client t ON t.client_id = c.client_id
     WHERE c.is_primary;`,
  ).trim();
  assert(createdBundle === '1', `create RPC should leave one primary in-tx, got ${createdBundle}`);

  const switchPrimary = asRole(
    'authenticated',
    ownerAuth,
    `SELECT public.create_client_with_primary_contact('Switch Co', 'First');
     INSERT INTO public.client_contacts (client_id, name, is_primary)
     SELECT id, 'Second', false FROM public.clients WHERE company_name = 'Switch Co';
     SELECT public.set_primary_client_contact(
       (SELECT id FROM public.clients WHERE company_name = 'Switch Co'),
       (SELECT id FROM public.client_contacts WHERE name = 'Second')
     );
     SELECT name FROM public.client_contacts WHERE is_primary
       AND client_id = (SELECT id FROM public.clients WHERE company_name = 'Switch Co');`,
  ).trim();
  assert(switchPrimary === 'Second', `primary should switch to Second, got ${switchPrimary}`);

  // Financial fixtures (committed via admin) — also proves archive preserves contacts
  const finClient = adminPsql(`
    INSERT INTO public.clients (company_name, billing_email, status)
    VALUES ('Finance Co', 'finance@phase6.test', 'active')
    RETURNING id;
  `).trim();
  adminPsql(`
    INSERT INTO public.client_contacts (client_id, name, email, is_primary)
    VALUES ('${finClient}', 'Fin Contact', 'fin@phase6.test', true);
  `);
  const finProject = adminPsql(`
    INSERT INTO public.projects (client_id, name, status, project_price_minor)
    VALUES ('${finClient}', 'Billable', 'active', 100000)
    RETURNING id;
  `).trim();
  adminPsql(`
    INSERT INTO public.invoices (client_id, project_id, invoice_number, status, currency, subtotal_minor, tax_minor, total_minor, amount_paid_minor, balance_due_minor, issue_date)
    VALUES ('${finClient}', '${finProject}', 'CXS-DRAFT-1', 'draft', 'CAD', 50000, 0, 50000, 0, 50000, CURRENT_DATE);
  `);
  const issuedInvoice = adminPsql(`
    INSERT INTO public.invoices (client_id, project_id, invoice_number, status, currency, subtotal_minor, tax_minor, total_minor, amount_paid_minor, balance_due_minor, issue_date)
    VALUES ('${finClient}', '${finProject}', 'CXS-ISSUE-1', 'issued', 'CAD', 40000, 0, 40000, 0, 40000, CURRENT_DATE)
    RETURNING id;
  `).trim();
  adminPsql(`
    INSERT INTO public.payments (invoice_id, client_id, amount_minor, currency, status, paid_at, refunded_minor)
    VALUES ('${issuedInvoice}', '${finClient}', 25000, 'CAD', 'succeeded', now(), 5000);
  `);

  const lifetime = asRole(
    'authenticated',
    ownerAuth,
    `SELECT lifetime_paid_minor::text FROM public.client_financial_summary WHERE client_id = '${finClient}';`,
  ).trim();
  const outstanding = asRole(
    'authenticated',
    ownerAuth,
    `SELECT outstanding_balance_minor::text FROM public.client_financial_summary WHERE client_id = '${finClient}';`,
  ).trim();
  assert(lifetime === '20000', `lifetime should be 25000-5000=20000, got ${lifetime}`);
  assert(outstanding === '40000', `outstanding should exclude draft and equal 40000, got ${outstanding}`);

  adminPsql(`UPDATE public.clients SET status = 'archived', archived_at = now() WHERE id = '${finClient}';`);
  const contactSurvives = adminPsql(
    `SELECT count(*)::text FROM public.client_contacts WHERE client_id = '${finClient}';`,
  ).trim();
  assert(contactSurvives === '1', `contacts must survive archive, got ${contactSurvives}`);

  // Phase 7 — project workflow RPC (allowed, forbidden, stale concurrency)
  const wfProject = adminPsql(`
    INSERT INTO public.projects (client_id, name, status, project_price_minor, deposit_bps, tax_bps, currency)
    VALUES ('${clientId}', 'Workflow Project', 'inquiry', 100000, 5000, 0, 'CAD')
    RETURNING id;
  `).trim();

  const moved = asRoleCommit(
    'authenticated',
    ownerAuth,
    `SELECT (public.transition_project('${wfProject}'::uuid, 'inquiry'::public.project_status, 'proposal'::public.project_status)).status::text;`,
  ).trim();
  assert(moved === 'proposal', `transition inquiry→proposal should yield proposal, got ${moved}`);
  assert(
    adminPsql(`SELECT status::text FROM public.projects WHERE id = '${wfProject}';`) === 'proposal',
    'committed status should be proposal',
  );

  let forbiddenFailed = false;
  try {
    asRole(
      'authenticated',
      ownerAuth,
      `SELECT public.transition_project('${wfProject}'::uuid, 'proposal'::public.project_status, 'completed'::public.project_status);`,
    );
  } catch (err) {
    forbiddenFailed = /invalid project transition|22023/i.test(String(err));
    if (!forbiddenFailed) throw err;
  }
  assert(forbiddenFailed, 'forbidden transition proposal→completed should fail');

  let staleFailed = false;
  try {
    asRole(
      'authenticated',
      ownerAuth,
      `SELECT public.transition_project('${wfProject}'::uuid, 'inquiry'::public.project_status, 'archived'::public.project_status);`,
    );
  } catch (err) {
    staleFailed = /project status conflict|40001|serialization/i.test(String(err));
    if (!staleFailed) throw err;
  }
  assert(staleFailed, 'stale expected status should fail');

  const archivedStatus = asRoleCommit(
    'authenticated',
    ownerAuth,
    `SELECT (public.transition_project('${wfProject}'::uuid, 'proposal'::public.project_status, 'archived'::public.project_status)).status::text;`,
  ).trim();
  assert(archivedStatus === 'archived', `archive should set archived, got ${archivedStatus}`);
  const beforeArchive = adminPsql(
    `SELECT status_before_archive::text FROM public.projects WHERE id = '${wfProject}';`,
  ).trim();
  assert(beforeArchive === 'proposal', `status_before_archive should be proposal, got ${beforeArchive}`);

  const restoredStatus = asRoleCommit(
    'authenticated',
    ownerAuth,
    `SELECT (public.transition_project('${wfProject}'::uuid, 'archived'::public.project_status, 'inquiry'::public.project_status)).status::text;`,
  ).trim();
  assert(restoredStatus === 'inquiry', `restore should return inquiry, got ${restoredStatus}`);
  assert(
    adminPsql(`SELECT status::text FROM public.projects WHERE id = '${wfProject}';`) === 'inquiry',
    'restored project should persist as inquiry',
  );

  // Phase 8 — finalize does not set sent; revision creates v2
  const propProject = adminPsql(`
    INSERT INTO public.projects (client_id, name, status, project_price_minor, deposit_bps, tax_bps, currency)
    VALUES ('${clientId}', 'Proposal Host', 'inquiry', 800000, 5000, 1300, 'CAD')
    RETURNING id;
  `).trim();
  const propNumber = adminPsql(`SELECT public.next_document_number('proposal', 'CXS-P', 2026);`).trim();
  const propId = adminPsql(`
    INSERT INTO public.proposals (client_id, project_id, proposal_number, title, status, created_by)
    VALUES ('${clientId}', '${propProject}', '${propNumber}', 'Phase 8 Proposal', 'draft', '${ownerProfile}')
    RETURNING id;
  `).trim();
  const propVersion = adminPsql(`
    INSERT INTO public.proposal_versions (
      proposal_id, version_number, title, subtotal_minor, discount_minor, tax_minor, total_minor, currency, tax_bps, deposit_bps
    ) VALUES ('${propId}', 1, 'Phase 8 Proposal', 800000, 0, 104000, 904000, 'CAD', 1300, 5000)
    RETURNING id;
  `).trim();
  adminPsql(`UPDATE public.proposals SET current_version_id = '${propVersion}' WHERE id = '${propId}';`);
  adminPsql(`
    INSERT INTO public.proposal_items (proposal_version_id, description, quantity, rate_minor, amount_minor)
    VALUES ('${propVersion}', 'Website', 1, 800000, 800000);
  `);

  const finalizedImmutable = asRoleCommit(
    'authenticated',
    ownerAuth,
    `SELECT is_immutable::text FROM public.finalize_proposal_version('${propId}'::uuid, '${propVersion}'::uuid);`,
  ).trim();
  assert(
    finalizedImmutable === 't' || finalizedImmutable === 'true',
    `finalize should lock version, got ${finalizedImmutable}`,
  );
  const parentStillDraft = adminPsql(`SELECT status::text FROM public.proposals WHERE id = '${propId}';`).trim();
  assert(parentStillDraft === 'draft', `finalize must keep draft status, got ${parentStillDraft}`);
  const sentAtNull = adminPsql(`SELECT (sent_at IS NULL)::text FROM public.proposals WHERE id = '${propId}';`).trim();
  assert(
    sentAtNull === 't' || sentAtNull === 'true',
    `finalize must not set sent_at (null check=${sentAtNull})`,
  );

  const revisionNumber = asRoleCommit(
    'authenticated',
    ownerAuth,
    `SELECT version_number::text FROM public.create_proposal_revision('${propId}'::uuid);`,
  ).trim();
  assert(revisionNumber === '2', `revision should be version 2, got ${revisionNumber}`);
  const v1StillImmutable = adminPsql(
    `SELECT is_immutable::text FROM public.proposal_versions WHERE id = '${propVersion}';`,
  ).trim();
  assert(
    v1StillImmutable === 't' || v1StillImmutable === 'true',
    'source version must remain immutable after revision',
  );

  // --- Phase 9: generation_key idempotency + snapshot immutability ---
  const genKey = `${versionId}:deposit`;
  const draftInvNumber = adminPsql(`SELECT public.next_document_number('invoice', 'CXS', 2026);`).trim();
  const draftInvId = adminPsql(`
    INSERT INTO public.invoices (
      client_id, project_id, proposal_id, proposal_version_id, generation_key,
      invoice_number, invoice_type, status, currency, issue_date, due_date,
      subtotal_minor, tax_minor, tax_bps, total_minor, amount_paid_minor, balance_due_minor,
      client_display_name, project_name
    ) VALUES (
      '${clientId}', '${projectId}', '${proposalId}', '${versionId}', '${genKey}',
      '${draftInvNumber}', 'deposit', 'draft', 'CAD', CURRENT_DATE, CURRENT_DATE,
      400000, 52000, 1300, 452000, 0, 452000,
      'Northline Demo Co', 'Brand Site'
    ) RETURNING id;
  `).trim();

  adminPsql(`
    INSERT INTO public.invoice_items (invoice_id, description, quantity, rate_minor, amount_minor)
    VALUES ('${draftInvId}', 'Deposit allocation', 1, 400000, 400000);
  `);

  try {
    adminPsql(`
      INSERT INTO public.invoices (
        client_id, project_id, proposal_id, proposal_version_id, generation_key,
        invoice_number, invoice_type, status, currency,
        subtotal_minor, tax_minor, total_minor, amount_paid_minor, balance_due_minor
      ) VALUES (
        '${clientId}', '${projectId}', '${proposalId}', '${versionId}', '${genKey}',
        'CXS-DUP-001', 'deposit', 'draft', 'CAD',
        400000, 52000, 452000, 0, 452000
      );
    `);
    throw new Error('duplicate active generation_key should fail');
  } catch (err) {
    assert(/unique|generation_key/i.test(String(err)), String(err));
  }

  adminPsql(`
    UPDATE public.invoices
    SET status = 'issued', client_display_name = 'Frozen Client Name'
    WHERE id = '${draftInvId}';
  `);

  try {
    adminPsql(`
      UPDATE public.invoices SET client_display_name = 'Tampered' WHERE id = '${draftInvId}';
    `);
    throw new Error('issued client snapshot update should fail');
  } catch (err) {
    assert(/financial snapshot/i.test(String(err)), String(err));
  }

  try {
    adminPsql(`
      UPDATE public.invoice_items SET amount_minor = 1 WHERE invoice_id = '${draftInvId}';
    `);
    throw new Error('issued invoice item update should fail');
  } catch (err) {
    assert(/invoice items on non-draft/i.test(String(err)), String(err));
  }

  // Table inventory
  const tableCount = adminPsql(`
    SELECT count(*) FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      AND table_name IN (
        'profiles','clients','client_contacts','projects','proposal_templates','proposals',
        'proposal_versions','proposal_items','proposal_acceptances','public_links','invoices',
        'invoice_items','payments','refunds','documents','email_logs','reminder_events',
        'activity_logs','settings','number_counters','webhook_events','proposal_change_requests',
        'invoice_checkout_sessions','email_outbox'
      );
  `).trim();
  assert(tableCount === '24', `Expected 24 Studio tables, got ${tableCount}`);

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
        'activity_logs','settings','number_counters','webhook_events','proposal_change_requests',
        'invoice_checkout_sessions','email_outbox'
      )
      AND NOT c.relrowsecurity;
  `).trim();
  assert(rlsOff === '', `RLS disabled on: ${rlsOff || '(none)'}`);

  // Phase 12: multiple active proposal/invoice links are allowed (capped in app).
  const linkHash = adminPsql(`SELECT encode(sha256('phase10-token-a'::bytea), 'hex');`).trim();
  adminPsql(`
    INSERT INTO public.public_links (
      resource_type, resource_id, proposal_version_id, token_hash
    ) VALUES (
      'proposal', '${proposalId}', '${versionId}', '${linkHash}'
    );
  `);
  adminPsql(`
    INSERT INTO public.public_links (
      resource_type, resource_id, proposal_version_id, token_hash
    ) VALUES (
      'proposal', '${proposalId}', '${versionId}', encode(sha256('phase12-token-b'::bytea), 'hex')
    );
  `);
  const proposalLinkCount = adminPsql(`
    SELECT count(*)::text FROM public.public_links
    WHERE resource_type = 'proposal' AND proposal_version_id = '${versionId}' AND revoked_at IS NULL;
  `).trim();
  assert(proposalLinkCount === '2', `expected 2 active proposal links, got ${proposalLinkCount}`);

  const invLinkHash = adminPsql(`SELECT encode(sha256('phase11-inv-token-a'::bytea), 'hex');`).trim();
  adminPsql(`
    INSERT INTO public.public_links (
      resource_type, resource_id, token_hash
    ) VALUES (
      'invoice', '${draftInvId}', '${invLinkHash}'
    );
  `);
  adminPsql(`
    INSERT INTO public.public_links (
      resource_type, resource_id, token_hash
    ) VALUES (
      'invoice', '${draftInvId}', encode(sha256('phase12-inv-token-b'::bytea), 'hex')
    );
  `);
  const invoiceLinkCount = adminPsql(`
    SELECT count(*)::text FROM public.public_links
    WHERE resource_type = 'invoice' AND resource_id = '${draftInvId}' AND revoked_at IS NULL;
  `).trim();
  assert(invoiceLinkCount === '2', `expected 2 active invoice links, got ${invoiceLinkCount}`);

  // Phase 12: email_outbox uniqueness + reminder settings defaults
  const outboxExists = adminPsql(`
    SELECT to_regclass('public.email_outbox') IS NOT NULL;
  `).trim();
  assert(outboxExists === 't', 'email_outbox missing');
  const reminderCols = adminPsql(`
    SELECT count(*)::text FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'settings'
      AND column_name IN (
        'business_timezone', 'reminder_before_due_days',
        'reminder_due_day_enabled', 'reminder_overdue_days'
      );
  `).trim();
  assert(reminderCols === '4', `reminder settings columns missing (got ${reminderCols})`);
  const invReminderCol = adminPsql(`
    SELECT count(*)::text FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'invoices'
      AND column_name = 'payment_reminders_enabled';
  `).trim();
  assert(invReminderCol === '1', 'payment_reminders_enabled missing');

  // Phase 11: reconcile payment RPC + idempotency
  const payCreated1 = adminPsql(`
    SELECT public.apply_succeeded_stripe_payment(
      '${draftInvId}',
      '${clientId}',
      (SELECT balance_due_minor FROM public.invoices WHERE id = '${draftInvId}'),
      'CAD',
      'pi_test_phase11_1',
      'cs_test_phase11_1',
      'Visa •••• 4242',
      now(),
      '{}'::jsonb
    )->>'payment_created';
  `).trim();
  assert(payCreated1 === 'true', `expected payment_created true, got ${payCreated1}`);
  const invoicePaidStatus = adminPsql(`
    SELECT status || ':' || amount_paid_minor || ':' || balance_due_minor
    FROM public.invoices WHERE id = '${draftInvId}';
  `).trim();
  assert(invoicePaidStatus === 'paid:452000:0', invoicePaidStatus);

  const payCreated2 = adminPsql(`
    SELECT public.apply_succeeded_stripe_payment(
      '${draftInvId}',
      '${clientId}',
      452000,
      'CAD',
      'pi_test_phase11_1',
      'cs_test_phase11_1',
      'Visa •••• 4242',
      now(),
      '{}'::jsonb
    )->>'payment_created';
  `).trim();
  assert(payCreated2 === 'false', `duplicate event must not create payment, got ${payCreated2}`);
  const paymentCount = adminPsql(`
    SELECT count(*) FROM public.payments WHERE provider_payment_id = 'pi_test_phase11_1';
  `).trim();
  assert(paymentCount === '1', `Expected 1 payment row, got ${paymentCount}`);

  // Refund reopen balance without deleting payment
  adminPsql(`
    SELECT public.apply_succeeded_stripe_refund(
      're_test_phase11_1',
      'pi_test_phase11_1',
      100,
      'CAD',
      now(),
      'requested_by_customer',
      '{}'::jsonb
    );
  `);
  const afterRefund = adminPsql(`
    SELECT status || ':' || amount_paid_minor || ':' || balance_due_minor
    FROM public.invoices WHERE id = '${draftInvId}';
  `).trim();
  assert(afterRefund === 'partially_paid:451900:100', afterRefund);

  console.log('[studio-db-test] OK — migrations applied; numbering, immutability, constraints, and RLS checks passed.');
}

try {
  main();
} catch (err) {
  console.error('[studio-db-test] FAILED');
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}

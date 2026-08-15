#!/usr/bin/env node
/**
 * Production launch configuration check — never prints secret values.
 * Exit 0 when code-side checks pass; prints unverified external gates separately.
 *
 * Usage: node scripts/launch-check.mjs
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const warnings = [];
const passes = [];

function ok(message) {
  passes.push(message);
}

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

function readOptionalEnvFile(name) {
  const filePath = path.join(root, name);
  if (!existsSync(filePath)) return {};
  const text = readFileSync(filePath, 'utf8');
  /** @type {Record<string, string>} */
  const out = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    out[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
  return out;
}

const env = {
  ...process.env,
  ...readOptionalEnvFile('.dev.vars'),
};

function present(key) {
  return Boolean(String(env[key] ?? '').trim());
}

function mode(key) {
  const value = String(env[key] ?? '').trim();
  if (value.startsWith('sk_test_') || value.startsWith('pk_test_')) return 'test';
  if (value.startsWith('sk_live_') || value.startsWith('pk_live_')) return 'live';
  return 'unknown';
}

// --- Code / repo checks ---
const config = readFileSync(path.join(root, 'supabase/config.toml'), 'utf8');
if (/\[auth\][\s\S]*?enable_signup\s*=\s*false/.test(config)) {
  ok('Local supabase/config.toml disables Auth signup');
} else {
  fail('supabase/config.toml must set [auth] enable_signup = false');
}

const migration = path.join(root, 'supabase/migrations/202608140018_release_hardening.sql');
if (existsSync(migration)) {
  ok('Release hardening migration 202608140018 present');
} else {
  fail('Missing 202608140018_release_hardening.sql');
}

const example = readFileSync(path.join(root, '.dev.vars.example'), 'utf8');
if (/sk_live_|re_[A-Za-z0-9]{20,}/.test(example)) {
  fail('.dev.vars.example appears to contain live/real secret material');
} else {
  ok('.dev.vars.example looks placeholder-only');
}

// --- Local env consistency (optional) ---
if (present('STRIPE_SECRET_KEY') && present('PUBLIC_STRIPE_PUBLISHABLE_KEY')) {
  const secretMode = mode('STRIPE_SECRET_KEY');
  const pubMode = mode('PUBLIC_STRIPE_PUBLISHABLE_KEY');
  if (secretMode !== 'unknown' && pubMode !== 'unknown' && secretMode !== pubMode) {
    fail('Stripe secret/publishable key modes disagree (test vs live)');
  } else {
    ok('Stripe key modes are consistent (or unknown custom prefixes)');
  }
}

if (mode('STRIPE_SECRET_KEY') === 'live') {
  const site = String(env.PUBLIC_SITE_URL ?? env.STUDIO_BASE_URL ?? '');
  if (/localhost|127\.0\.0\.1|^http:\/\//i.test(site)) {
    fail('Live Stripe secret paired with localhost/http site URL');
  }
}

if (present('STUDIO_EMAIL_TEST_OVERRIDE') || present('EMAIL_TEST_OVERRIDE')) {
  warn('Email test override env is set — must be unset in production');
}

// --- External gates (never auto-pass) ---
const external = [
  'Supabase production project created; migrations applied',
  'Supabase Auth: disable public signup (Dashboard mirrors config.toml)',
  'Supabase PITR / backups enabled and retention verified',
  'Stripe live mode + webhook endpoint POST /api/webhooks/stripe',
  'Resend domain + STUDIO_FROM_EMAIL verified',
  'Cloudflare custom domain + DNS for studio + marketing',
  'Cloudflare Cron triggers for POST /api/studio/jobs/process',
  'BROWSER binding + private studio-documents Storage bucket policies',
  'Encrypted Worker secrets: SUPABASE_SECRET_KEY, STRIPE_*, RESEND_*, CRON_SECRET',
  'STUDIO_OS_ENABLED=true only after smoke tests on staging',
];

console.log('Launch check — code-verifiable\n');
for (const message of passes) console.log(`  PASS  ${message}`);
for (const message of warnings) console.log(`  WARN  ${message}`);
for (const message of failures) console.log(`  FAIL  ${message}`);

console.log('\nExternal production gates (manual — not verified by this script)\n');
for (const item of external) console.log(`  [ ]  ${item}`);

if (failures.length) {
  console.log(`\nResult: BLOCKED (${failures.length} code-side failure(s))`);
  process.exit(1);
}

console.log('\nResult: CODE CHECKS PASSED — external gates still required for production');
process.exit(0);

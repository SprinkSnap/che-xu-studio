#!/usr/bin/env node
/**
 * Cloudflare Workers Builds / CI deploy entrypoint.
 *
 * Uses the cleaned root wrangler.json from prepare-cf-deploy.mjs and disables
 * Wrangler resource auto-provisioning (`--x-provision=false`) so a pre-existing
 * `*-session` KV namespace cannot fail the deploy with API error 10014.
 *
 * Also passes `--keep-vars` so dashboard Variables are not wiped, and
 * re-injects PUBLIC_* vars from process.env (Workers Builds env) into wrangler.json
 * so Turnstile works even when dashboard vars were never bound.
 *
 * If TURNSTILE_SECRET_KEY / RESEND_API_KEY are present in the Builds environment
 * (as encrypted secrets), they are uploaded with `--secrets-file` on every deploy
 * so they cannot silently disappear from the Worker.
 *
 * Workers Builds settings:
 *   Build command:  npm run build
 *   Deploy command: npm run cf:deploy
 *   Environment variables (plain):
 *     PUBLIC_TURNSTILE_SITE_KEY
 *     PUBLIC_SITE_URL=https://chexustudio.com
 *     CONTACT_FROM_EMAIL (optional; or set on Worker)
 *   Environment secrets (Encrypt):
 *     TURNSTILE_SECRET_KEY
 *     RESEND_API_KEY
 */
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdtempSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { injectPublicWorkerVars } from './inject-public-vars.mjs';
import { collectRuntimeSecrets } from './runtime-secrets.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const configPath = resolve(root, 'wrangler.json');

if (!existsSync(configPath)) {
  console.error('[cf-deploy] Missing wrangler.json. Run `npm run build` first.');
  process.exit(1);
}

const config = JSON.parse(readFileSync(configPath, 'utf8'));
const danglingKv = (config.kv_namespaces || []).filter((ns) => !ns?.id);
if (danglingKv.length > 0) {
  console.error('[cf-deploy] Deploy config still has id-less KV bindings:');
  console.error(JSON.stringify(danglingKv, null, 2));
  console.error('Re-run `npm run build` (prepare-cf-deploy should strip these).');
  process.exit(1);
}

// Belt-and-suspenders: also set in wrangler.json so keep-vars survives flag quirks.
config.keep_vars = true;

const { config: withVars, applied } = injectPublicWorkerVars(config, process.env, { log: true });
writeFileSync(configPath, `${JSON.stringify(withVars, null, 2)}\n`);

if (!applied.includes('PUBLIC_TURNSTILE_SITE_KEY')) {
  console.warn(
    [
      '[cf-deploy] PUBLIC_TURNSTILE_SITE_KEY is not set in this environment.',
      'Contact form will fall back to mailto until you add it under:',
      '  Workers Builds → Settings → Variables → PUBLIC_TURNSTILE_SITE_KEY',
      'Then retry the deployment.',
    ].join('\n'),
  );
}

const secrets = collectRuntimeSecrets(process.env);
/** @type {string | null} */
let secretsFilePath = null;

if (Object.keys(secrets).length > 0) {
  const dir = mkdtempSync(join(tmpdir(), 'cf-deploy-secrets-'));
  secretsFilePath = join(dir, 'secrets.json');
  writeFileSync(secretsFilePath, `${JSON.stringify(secrets)}\n`, { mode: 0o600 });
  console.log(`[cf-deploy] Uploading runtime secrets: ${Object.keys(secrets).join(', ')}`);
} else {
  console.warn(
    [
      '[cf-deploy] No runtime secrets in process.env (TURNSTILE_SECRET_KEY / RESEND_API_KEY).',
      'Add them as Encrypt secrets under Workers Builds → Settings → Variables,',
      'or as Worker Settings → Variables and Secrets → Secret (type Encrypt).',
      'Do not add TURNSTILE_SECRET_KEY as a plain Variable — deploys can wipe those.',
    ].join('\n'),
  );
}

const args = [
  'wrangler',
  'deploy',
  '--config',
  configPath,
  '--x-provision=false',
  // Preserve Variables set in the Cloudflare dashboard (not in wrangler.json).
  '--keep-vars',
  ...(secretsFilePath ? ['--secrets-file', secretsFilePath] : []),
  ...process.argv.slice(2),
];

console.log(
  `[cf-deploy] npx ${args
    .map((a) => (secretsFilePath && a === secretsFilePath ? '<secrets-file>' : a))
    .join(' ')}`,
);

let status = 1;
try {
  const result = spawnSync('npx', args, {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });
  status = result.status ?? 1;
} finally {
  if (secretsFilePath) {
    try {
      unlinkSync(secretsFilePath);
    } catch {
      // ignore cleanup failures
    }
  }
}

process.exit(status);

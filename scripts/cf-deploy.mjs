#!/usr/bin/env node
/**
 * Cloudflare Workers Builds / CI deploy entrypoint.
 *
 * Uses the cleaned root wrangler.json from prepare-cf-deploy.mjs and disables
 * Wrangler resource auto-provisioning (`--x-provision=false`) so a pre-existing
 * `*-session` KV namespace cannot fail the deploy with API error 10014.
 *
 * Also passes `--keep-vars` so dashboard Variables/Secrets are not wiped, and
 * re-injects PUBLIC_* vars from process.env (Workers Builds env) into wrangler.json
 * so Turnstile works even when dashboard vars were never bound.
 *
 * Workers Builds settings:
 *   Build command:  npm run build
 *   Deploy command: npm run cf:deploy
 *   Environment variables:
 *     PUBLIC_TURNSTILE_SITE_KEY
 *     PUBLIC_SITE_URL=https://chexustudio.com
 *   Worker secret (Settings → Variables and Secrets):
 *     TURNSTILE_SECRET_KEY
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { injectPublicWorkerVars } from './inject-public-vars.mjs';

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

const args = [
  'wrangler',
  'deploy',
  '--config',
  configPath,
  '--x-provision=false',
  // Preserve Variables/Secrets set in the Cloudflare dashboard (not in wrangler.json).
  '--keep-vars',
  ...process.argv.slice(2),
];

console.log(`[cf-deploy] npx ${args.join(' ')}`);
const result = spawnSync('npx', args, {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
});

process.exit(result.status ?? 1);

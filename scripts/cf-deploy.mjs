#!/usr/bin/env node
/**
 * Cloudflare Workers Builds / CI deploy entrypoint.
 *
 * Uses the cleaned root wrangler.json from prepare-cf-deploy.mjs and disables
 * Wrangler resource auto-provisioning (`--x-provision=false`) so a pre-existing
 * `*-session` KV namespace cannot fail the deploy with API error 10014.
 *
 * Also passes `--keep-vars` so dashboard Variables/Secrets (Turnstile, PUBLIC_SITE_URL)
 * are not wiped on every Workers Builds deploy (wrangler deletes unbound vars by default).
 *
 * Workers Builds settings:
 *   Build command:  npm run build
 *   Deploy command: npm run cf:deploy
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

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

#!/usr/bin/env node
/**
 * Creates the production D1 database (if needed) and writes its ID into wrangler.jsonc.
 *
 * Usage (on a machine authenticated to Cloudflare):
 *   npx wrangler login
 *   npm run db:create
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const wranglerPath = resolve(root, 'wrangler.jsonc');
const PLACEHOLDER = '00000000-0000-0000-0000-000000000000';
const DB_NAME = 'che-xu-studio-db';

const current = readFileSync(wranglerPath, 'utf8');
const existing = current.match(/"database_id"\s*:\s*"([^"]+)"/)?.[1];

if (existing && existing !== PLACEHOLDER) {
  console.log(`[db:create] database_id already set: ${existing}`);
  console.log('[db:create] Nothing to do. Commit wrangler.jsonc if this ID is intentional.');
  process.exit(0);
}

console.log(`[db:create] Creating D1 database "${DB_NAME}"…`);
let output = '';
try {
  output = execFileSync('npx', ['wrangler', 'd1', 'create', DB_NAME], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  const stderr = err && typeof err === 'object' && 'stderr' in err ? String(err.stderr) : '';
  console.error('[db:create] Failed to create D1 database.');
  console.error(stderr || message);
  console.error('\nAuthenticate first:\n  npx wrangler login\nThen re-run:\n  npm run db:create\n');
  process.exit(1);
}

const combined = `${output}`;
const idMatch =
  combined.match(/database_id\s*=\s*"([0-9a-f-]{36})"/i) ||
  combined.match(/"database_id"\s*:\s*"([0-9a-f-]{36})"/i) ||
  combined.match(/\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i);

if (!idMatch) {
  console.error('[db:create] Created database but could not parse database_id from Wrangler output:');
  console.error(combined);
  process.exit(1);
}

const databaseId = idMatch[1];
const updated = current.replace(
  /"database_id"\s*:\s*"[^"]+"/,
  `"database_id": "${databaseId}"`,
);

if (updated === current) {
  console.error('[db:create] Could not find database_id field to update in wrangler.jsonc');
  process.exit(1);
}

writeFileSync(wranglerPath, updated);
console.log(`[db:create] Updated wrangler.jsonc with database_id=${databaseId}`);
console.log('[db:create] Next steps:');
console.log('  1. npm run db:migrate:remote');
console.log('  2. Commit and push wrangler.jsonc');
console.log('  3. Re-run the Cloudflare Workers build / npm run deploy');

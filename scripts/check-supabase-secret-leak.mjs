#!/usr/bin/env node
/**
 * Fail if a known canary SUPABASE_SECRET_KEY value appears in emitted client assets.
 * Run after `npm run build`. Does not print secret values.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const CANARY = process.env.SUPABASE_SECRET_LEAK_CANARY || 'sb_secret_phase3_canary_do_not_ship';
const SEARCH_ROOTS = ['dist/client', 'dist/_astro', 'dist'];

async function walk(dir, files = []) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip server bundle — secret may legitimately appear there when configured.
      if (full.endsWith(`${path.sep}dist${path.sep}server`) || full.includes(`${path.sep}server${path.sep}`)) {
        continue;
      }
      await walk(full, files);
    } else if (/\.(js|mjs|css|html|map)$/i.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

async function main() {
  const hits = [];
  for (const rel of SEARCH_ROOTS) {
    const abs = path.join(ROOT, rel);
    try {
      await stat(abs);
    } catch {
      continue;
    }
    const files = await walk(abs);
    for (const file of files) {
      // Never scan the Worker server entry for this check.
      if (file.includes(`${path.sep}dist${path.sep}server${path.sep}`)) continue;
      const text = await readFile(file, 'utf8');
      if (text.includes(CANARY) || text.includes('SUPABASE_SECRET_KEY')) {
        // Allow the string SUPABASE_SECRET_KEY only in sourcemaps of server code;
        // client assets must not mention the env key name either if avoidable.
        if (file.includes(`${path.sep}_astro${path.sep}`) || file.includes(`${path.sep}client${path.sep}`)) {
          hits.push(path.relative(ROOT, file));
        } else if (/\.(js|mjs|html)$/i.test(file) && !file.includes(`${path.sep}server${path.sep}`)) {
          // Static HTML/marketing assets under dist/
          if (text.includes(CANARY)) hits.push(path.relative(ROOT, file));
        }
      }
    }
  }

  if (hits.length > 0) {
    console.error('[check:supabase-secret-leak] Possible secret leakage in client assets:');
    for (const hit of hits.slice(0, 20)) console.error(`  - ${hit}`);
    process.exit(1);
  }

  console.log('[check:supabase-secret-leak] OK — canary secret not found in client assets.');
}

main().catch((err) => {
  console.error('[check:supabase-secret-leak] Failed', err instanceof Error ? err.message : 'unknown');
  process.exit(1);
});

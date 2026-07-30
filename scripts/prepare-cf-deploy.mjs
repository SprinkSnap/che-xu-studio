import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const generatedPath = resolve(root, 'dist/server/wrangler.json');
const entryPath = resolve(root, 'dist/server/entry.mjs');
const clientDir = resolve(root, 'dist/client');
const PLACEHOLDER_DB = '00000000-0000-0000-0000-000000000000';

if (!existsSync(generatedPath) || !existsSync(entryPath) || !existsSync(clientDir)) {
  console.error(
    '[prepare-cf-deploy] Missing Astro Cloudflare build output. Run `astro build` first.',
  );
  console.error(`  expected: ${generatedPath}`);
  console.error(`  expected: ${entryPath}`);
  console.error(`  expected: ${clientDir}`);
  process.exit(1);
}

const generated = JSON.parse(readFileSync(generatedPath, 'utf8'));
const databaseId = generated.d1_databases?.[0]?.database_id;
const isCi = Boolean(process.env.CI || process.env.WORKERS_CI || process.env.CF_PAGES);

if (!databaseId || databaseId === PLACEHOLDER_DB) {
  const message = [
    `[prepare-cf-deploy] D1 database_id is still the placeholder (${PLACEHOLDER_DB}).`,
    'Cloudflare rejects deploy until a real database exists for binding DB.',
    '',
    'On an authenticated machine run:',
    '  npx wrangler login',
    '  npm run db:create',
    '  npm run db:migrate:remote',
    'Then commit the updated wrangler.jsonc and redeploy.',
  ].join('\n');

  if (isCi) {
    console.error(message);
    process.exit(1);
  }

  console.warn(message);
  console.warn('[prepare-cf-deploy] Continuing locally, but production deploy will fail until fixed.');
}

const deployConfig = {
  ...generated,
  // Keep the Cloudflare Workers service name in sync with the dashboard project.
  name: 'che-xu-studio-site',
  main: './dist/server/entry.mjs',
  assets: {
    ...(generated.assets || {}),
    directory: './dist/client',
    binding: generated.assets?.binding || 'ASSETS',
  },
};

// wrangler.json is preferred over wrangler.jsonc and is gitignored.
writeFileSync(resolve(root, 'wrangler.json'), `${JSON.stringify(deployConfig, null, 2)}\n`);

// Also restore/ensure the Astro deploy redirect used by newer Wrangler versions.
const redirectDir = resolve(root, '.wrangler/deploy');
mkdirSync(redirectDir, { recursive: true });
writeFileSync(
  resolve(redirectDir, 'config.json'),
  `${JSON.stringify({ configPath: '../../dist/server/wrangler.json', auxiliaryWorkers: [] }, null, 2)}\n`,
);

console.log('[prepare-cf-deploy] Wrote wrangler.json and .wrangler/deploy/config.json');

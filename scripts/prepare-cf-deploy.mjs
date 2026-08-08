import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { injectPublicWorkerVars } from './inject-public-vars.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const generatedPath = resolve(root, 'dist/server/wrangler.json');
const entryPath = resolve(root, 'dist/server/entry.mjs');
const clientDir = resolve(root, 'dist/client');
const rootWranglerPath = resolve(root, 'wrangler.json');
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

/**
 * Remove bindings that trigger Wrangler auto-provisioning without resource IDs.
 * Incomplete SESSION KV bindings are the common Workers Builds failure mode (API 10014).
 */
function sanitizeBindings(config, { log = true } = {}) {
  const next = { ...config };

  // Drop Astro/Wrangler merge metadata — deploy should use this file as-is.
  delete next.configPath;
  delete next.userConfigPath;
  delete next.topLevelName;
  delete next.definedEnvironments;
  delete next.previews;
  delete next.dev;

  // Preserve dashboard Variables when Wrangler replaces remote config.
  next.keep_vars = true;

  if (Array.isArray(next.kv_namespaces)) {
    const before = next.kv_namespaces;
    next.kv_namespaces = before.filter((ns) => Boolean(ns?.id));
    const removed = before.length - next.kv_namespaces.length;
    if (log && removed > 0) {
      console.warn(
        `[prepare-cf-deploy] Removed ${removed} KV binding(s) without id (avoids API 10014 auto-provision).`,
      );
    }
    if (next.kv_namespaces.length === 0) {
      delete next.kv_namespaces;
    }
  }

  if (Array.isArray(next.d1_databases)) {
    const usable = next.d1_databases.filter(
      (db) => db?.database_id && db.database_id !== PLACEHOLDER_DB,
    );
    const omitted = next.d1_databases.length - usable.length;
    if (log && omitted > 0) {
      console.warn(
        [
          `[prepare-cf-deploy] Omitting ${omitted} D1 binding(s) with missing/placeholder database_id.`,
          'Marketing pages still deploy. Contact lead persistence stays offline until you run:',
          '  npx wrangler login && npm run db:create && npm run db:migrate:remote',
          'Then commit the updated wrangler.jsonc and redeploy.',
        ].join('\n'),
      );
    }
    if (usable.length > 0) {
      next.d1_databases = usable;
    } else {
      delete next.d1_databases;
    }
  }

  return next;
}

const generated = JSON.parse(readFileSync(generatedPath, 'utf8'));

// Keep Astro-relative paths in dist/server/wrangler.json (main: entry.mjs, assets: ../client).
const serverConfig = sanitizeBindings(
  {
    ...generated,
    name: 'che-xu-studio-site',
  },
  { log: true },
);

// Root wrangler.json is preferred by Workers Builds when present (gitignored).
const rootConfig = sanitizeBindings(
  {
    ...generated,
    name: 'che-xu-studio-site',
    main: './dist/server/entry.mjs',
    assets: {
      ...(generated.assets || {}),
      directory: './dist/client',
      binding: generated.assets?.binding || 'ASSETS',
      // Run the Worker (middleware / SSR routes) before static Assets so HTML
      // Cache-Control from middleware is applied and stale CDN HTML can be bypassed.
      run_worker_first: true,
    },
  },
  { log: false },
);

injectPublicWorkerVars(serverConfig, process.env, { log: true });
injectPublicWorkerVars(rootConfig, process.env, { log: false });

const serverJson = `${JSON.stringify(serverConfig, null, 2)}\n`;
const rootJson = `${JSON.stringify(rootConfig, null, 2)}\n`;

writeFileSync(generatedPath, serverJson);
writeFileSync(rootWranglerPath, rootJson);

// Point Astro/Wrangler redirect at the cleaned root config (Workers Builds + preview).
const redirectDir = resolve(root, '.wrangler/deploy');
mkdirSync(redirectDir, { recursive: true });
writeFileSync(
  resolve(redirectDir, 'config.json'),
  `${JSON.stringify({ configPath: '../../wrangler.json', auxiliaryWorkers: [] }, null, 2)}\n`,
);

const danglingKv = rootConfig.kv_namespaces?.filter((ns) => !ns?.id) ?? [];
if (danglingKv.length > 0) {
  console.error('[prepare-cf-deploy] Refusing to write deploy config with id-less KV bindings:');
  console.error(JSON.stringify(danglingKv, null, 2));
  process.exit(1);
}

console.log(
  [
    '[prepare-cf-deploy] Wrote cleaned deploy configs:',
    `  ${rootWranglerPath}`,
    `  ${generatedPath}`,
    `  kv_namespaces: ${JSON.stringify(rootConfig.kv_namespaces ?? null)}`,
    `  d1_databases: ${rootConfig.d1_databases ? rootConfig.d1_databases.length : 0}`,
    `  vars: ${JSON.stringify(Object.keys(rootConfig.vars || {}))}`,
  ].join('\n'),
);

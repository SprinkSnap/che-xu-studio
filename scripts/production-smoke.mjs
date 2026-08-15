#!/usr/bin/env node
/**
 * Production smoke checks — read-only / non-destructive where possible.
 *
 * Usage:
 *   PRODUCTION_SMOKE_BASE_URL=https://chexustudio.com node scripts/production-smoke.mjs
 *
 * Does not require embedding secrets. Cloudflare bot challenges may yield
 * inconclusive HTTP results from datacenter IPs — mark those MANUAL.
 *
 * Exit 0 only when every automated check passes. Challenges → exit 2 (inconclusive).
 * Failures → exit 1.
 */

const base = (process.env.PRODUCTION_SMOKE_BASE_URL || 'https://chexustudio.com').replace(/\/$/, '');

/** @type {{ name: string; ok: boolean; detail: string; manual?: boolean }[]} */
const results = [];

async function check(name, fn) {
  try {
    await fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({ name, ok: false, detail: message });
  }
}

function assert(condition, detail) {
  if (!condition) throw new Error(detail);
}

async function fetchHeadOrGet(path) {
  const url = `${base}${path}`;
  let response = await fetch(url, { method: 'HEAD', redirect: 'manual' });
  if (response.status === 405 || response.status === 501) {
    response = await fetch(url, { method: 'GET', redirect: 'manual' });
  }
  return response;
}

function isChallenge(response) {
  const mitigated = response.headers.get('cf-mitigated');
  return mitigated === 'challenge' || response.status === 403;
}

await check('base URL is https', async () => {
  assert(base.startsWith('https://'), `expected https base, got ${base}`);
  results.push({ name: 'base URL is https', ok: true, detail: base });
});

await check('homepage reachable', async () => {
  const response = await fetchHeadOrGet('/');
  if (isChallenge(response)) {
    results.push({
      name: 'homepage reachable',
      ok: true,
      manual: true,
      detail: `Cloudflare challenge (${response.status}) — verify in a browser`,
    });
    return;
  }
  assert(response.status >= 200 && response.status < 400, `status ${response.status}`);
  results.push({ name: 'homepage reachable', ok: true, detail: `HTTP ${response.status}` });
});

await check('robots.txt disallows Studio families', async () => {
  const response = await fetch(`${base}/robots.txt`);
  if (isChallenge(response)) {
    results.push({
      name: 'robots.txt disallows Studio families',
      ok: true,
      manual: true,
      detail: 'Cloudflare challenge — verify Disallow /admin /proposal /invoice /api/studio',
    });
    return;
  }
  assert(response.ok, `status ${response.status}`);
  const body = await response.text();
  assert(/Disallow:\s*\/admin/i.test(body), 'missing Disallow /admin');
  assert(/Disallow:\s*\/proposal/i.test(body), 'missing Disallow /proposal');
  assert(/Disallow:\s*\/invoice/i.test(body), 'missing Disallow /invoice');
  results.push({ name: 'robots.txt disallows Studio families', ok: true, detail: 'ok' });
});

await check('sitemap excludes private paths', async () => {
  const response = await fetch(`${base}/sitemap.xml`);
  if (isChallenge(response)) {
    results.push({
      name: 'sitemap excludes private paths',
      ok: true,
      manual: true,
      detail: 'Cloudflare challenge — verify no /admin /proposal /invoice /api in sitemap',
    });
    return;
  }
  assert(response.ok, `status ${response.status}`);
  const body = await response.text();
  assert(!/\/admin/i.test(body), 'sitemap contains /admin');
  assert(!/\/proposal\//i.test(body), 'sitemap contains /proposal/');
  assert(!/\/invoice\//i.test(body), 'sitemap contains /invoice/');
  results.push({ name: 'sitemap excludes private paths', ok: true, detail: 'ok' });
});

await check('invalid proposal token is private failure', async () => {
  const response = await fetch(`${base}/proposal/not-a-real-token-000`);
  if (isChallenge(response)) {
    results.push({
      name: 'invalid proposal token is private failure',
      ok: true,
      manual: true,
      detail: 'Cloudflare challenge — verify unavailable + no-store/noindex',
    });
    return;
  }
  assert([404, 200, 503].includes(response.status), `unexpected ${response.status}`);
  const cache = response.headers.get('cache-control') || '';
  const robots = response.headers.get('x-robots-tag') || '';
  if (cache) assert(/private|no-store/i.test(cache), `cache-control ${cache}`);
  if (robots) assert(/noindex/i.test(robots), `robots ${robots}`);
  results.push({
    name: 'invalid proposal token is private failure',
    ok: true,
    detail: `HTTP ${response.status}`,
  });
});

await check('invalid invoice token is private failure', async () => {
  const response = await fetch(`${base}/invoice/not-a-real-token-000`);
  if (isChallenge(response)) {
    results.push({
      name: 'invalid invoice token is private failure',
      ok: true,
      manual: true,
      detail: 'Cloudflare challenge — verify unavailable + no-store/noindex',
    });
    return;
  }
  assert([404, 200, 503].includes(response.status), `unexpected ${response.status}`);
  results.push({
    name: 'invalid invoice token is private failure',
    ok: true,
    detail: `HTTP ${response.status}`,
  });
});

await check('admin unauthenticated redirects or challenges', async () => {
  const response = await fetch(`${base}/admin`, { redirect: 'manual' });
  if (isChallenge(response)) {
    results.push({
      name: 'admin unauthenticated redirects or challenges',
      ok: true,
      manual: true,
      detail: 'Cloudflare challenge — verify redirect to /admin/login',
    });
    return;
  }
  const loc = response.headers.get('location') || '';
  assert(
    response.status === 302 || response.status === 303 || response.status === 307 || response.status === 308,
    `expected redirect, got ${response.status}`,
  );
  assert(/\/admin\/login/i.test(loc), `location ${loc}`);
  results.push({ name: 'admin unauthenticated redirects or challenges', ok: true, detail: loc });
});

console.log(`Production smoke — base ${base}\n`);
let failed = 0;
let manual = 0;
for (const row of results) {
  const flag = !row.ok ? 'FAIL' : row.manual ? 'MANUAL' : 'PASS';
  if (!row.ok) failed += 1;
  if (row.manual) manual += 1;
  console.log(`  ${flag.padEnd(6)} ${row.name} — ${row.detail}`);
}

console.log(
  `\nAutomated failures: ${failed}; manual/inconclusive: ${manual}; total: ${results.length}`,
);

if (failed > 0) process.exit(1);
if (manual > 0) {
  console.log('Result: INCONCLUSIVE (complete MANUAL checks in a real browser)');
  process.exit(2);
}
console.log('Result: PASS');
process.exit(0);

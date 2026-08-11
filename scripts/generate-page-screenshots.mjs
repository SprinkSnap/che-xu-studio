#!/usr/bin/env node
/**
 * Capture full-page screenshots of every marketing route into docs/page-screenshots.
 *
 * Usage:
 *   PLAYWRIGHT_BASE_URL=http://127.0.0.1:4321 node scripts/generate-page-screenshots.mjs
 *
 * Or after `npm run build`, the script can start preview itself when BASE_URL is unset
 * and no server is already listening on 4321.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from '@playwright/test';
import { spawn } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const outDir = join(root, 'docs', 'page-screenshots');

const ROUTES = [
  { path: '/', slug: 'home' },
  { path: '/services/web-design/', slug: 'services-web-design' },
  { path: '/services/seo/', slug: 'services-seo' },
  { path: '/services/website-care/', slug: 'services-website-care' },
  { path: '/pricing/', slug: 'pricing' },
  { path: '/work/', slug: 'work' },
  { path: '/about/', slug: 'about' },
  { path: '/contact/', slug: 'contact' },
  { path: '/insights/', slug: 'insights' },
  { path: '/privacy/', slug: 'privacy' },
  { path: '/terms/', slug: 'terms' },
  { path: '/refund-cancellation-policy/', slug: 'refund-cancellation-policy' },
  { path: '/checkout/success/', slug: 'checkout-success' },
  { path: '/checkout/cancelled/', slug: 'checkout-cancelled' },
  { path: '/404/', slug: '404' },
];

const VIEWPORTS = [
  {
    name: 'desktop',
    use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
  },
  {
    name: 'mobile',
    use: devices['Pixel 5'],
  },
];

function canListen(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '127.0.0.1');
  });
}

async function waitForUrl(url, timeoutMs = 120_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { redirect: 'manual' });
      if (res.status > 0) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function ensurePreview() {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:4321';
  const url = new URL(baseURL);
  const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));

  try {
    const res = await fetch(baseURL, { redirect: 'manual' });
    if (res.status > 0) {
      return { baseURL, stop: async () => {} };
    }
  } catch {
    // start preview
  }

  if (!(await canListen(port))) {
    await waitForUrl(baseURL);
    return { baseURL, stop: async () => {} };
  }

  const child = spawn(
    'npm',
    ['run', 'preview', '--', '--host', '127.0.0.1', '--port', String(port)],
    {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
      detached: true,
    },
  );

  let logs = '';
  child.stdout.on('data', (d) => {
    logs += d.toString();
  });
  child.stderr.on('data', (d) => {
    logs += d.toString();
  });

  try {
    await waitForUrl(baseURL);
  } catch (err) {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      child.kill('SIGTERM');
    }
    throw new Error(`${err.message}\nPreview logs:\n${logs}`);
  }

  return {
    baseURL,
    stop: async () => {
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {
        if (!child.killed) child.kill('SIGTERM');
      }
    },
  };
}

async function main() {
  const { baseURL, stop } = await ensurePreview();
  await mkdir(join(outDir, 'desktop'), { recursive: true });
  await mkdir(join(outDir, 'mobile'), { recursive: true });

  const browser = await chromium.launch();
  const manifest = [];

  try {
    for (const viewport of VIEWPORTS) {
      const context = await browser.newContext({
        ...viewport.use,
        deviceScaleFactor: viewport.use.deviceScaleFactor ?? 1,
      });
      const page = await context.newPage();

      for (const route of ROUTES) {
        const target = new URL(route.path, baseURL).toString();
        // Contact embeds Turnstile, which may keep the network busy — avoid networkidle.
        const response = await page.goto(target, { waitUntil: 'load', timeout: 60_000 });
        await page.waitForLoadState('domcontentloaded');
        // Allow layout/fonts/images to settle without waiting on long-lived requests.
        await page.waitForTimeout(800);
        const fileName = `${route.slug}.png`;
        const filePath = join(outDir, viewport.name, fileName);
        await page.screenshot({ path: filePath, fullPage: true });
        manifest.push({
          viewport: viewport.name,
          slug: route.slug,
          path: route.path,
          status: response?.status() ?? null,
          file: `docs/page-screenshots/${viewport.name}/${fileName}`,
        });
        console.log(`✓ ${viewport.name}/${fileName} (${response?.status() ?? 'n/a'})`);
      }

      await context.close();
    }
  } finally {
    await browser.close();
    await stop();
  }

  const readme = `# Page screenshots

Full-page captures of Che Xu Studio marketing routes:

- **desktop/** — 1440×900 viewport
- **mobile/** — Pixel 5 viewport

## Regenerate

\`\`\`bash
npm run build
npm run screenshots:pages
\`\`\`

Optional: point at an already-running server with \`PLAYWRIGHT_BASE_URL\`.

See \`manifest.json\` for the capture list (path, viewport, HTTP status, file).

## Routes

| Route | Desktop | Mobile |
| --- | --- | --- |
${ROUTES.map(
  (r) =>
    `| \`${r.path}\` | [desktop/${r.slug}.png](./desktop/${r.slug}.png) | [mobile/${r.slug}.png](./mobile/${r.slug}.png) |`,
).join('\n')}
`;

  await writeFile(join(outDir, 'README.md'), readme);
  await writeFile(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`\nWrote ${manifest.length} screenshots to docs/page-screenshots/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

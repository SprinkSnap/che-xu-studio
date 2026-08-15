/**
 * Server-only HTML → PDF adapter (Cloudflare Browser Rendering).
 * Never accepts arbitrary URLs — only trusted HTML from view-model templates.
 */

import type { PdfRenderResult } from './types';
import { isPdfBytes } from './types';
import { MAX_PDF_BYTES } from '../documents/types';

export type BrowserBinding = unknown;

const RENDER_TIMEOUT_MS = 45_000;

function assertServerOnly(): void {
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    throw new Error('PDF renderer is server-only');
  }
}

async function getBrowserBinding(): Promise<BrowserBinding | null> {
  try {
    const worker = await import('cloudflare:workers');
    const env = worker.env as { BROWSER?: BrowserBinding };
    return env.BROWSER ?? null;
  } catch {
    return null;
  }
}

/**
 * Convert trusted HTML into PDF bytes via Cloudflare Browser Rendering.
 * Uses page.setContent — never page.goto(userUrl).
 */
export async function renderHtmlToPdf(
  html: string,
  options?: { browser?: BrowserBinding | null; timeoutMs?: number },
): Promise<PdfRenderResult> {
  assertServerOnly();
  const timeoutMs = options?.timeoutMs ?? RENDER_TIMEOUT_MS;
  const browserBinding = options?.browser === undefined ? await getBrowserBinding() : options.browser;

  if (!browserBinding) {
    return {
      ok: false,
      retryable: true,
      error: 'PDF generation is temporarily unavailable.',
    };
  }

  try {
    const puppeteer = await import('@cloudflare/puppeteer');
    const browser = await puppeteer.default.launch(browserBinding as never);
    try {
      const page = await browser.newPage();
      page.setDefaultTimeout(timeoutMs);
      await page.setContent(html, { waitUntil: 'load', timeout: timeoutMs });
      await page
        .waitForFunction(
          () => document.body?.getAttribute('data-pdf-ready') === 'true',
          { timeout: Math.min(timeoutMs, 15_000) },
        )
        .catch(() => undefined);
      await page.evaluate(async () => {
        try {
          const fonts = document.fonts;
          if (fonts?.ready) await fonts.ready;
        } catch {
          /* ignore */
        }
      });

      const pdfBuffer = await page.pdf({
        format: 'Letter',
        printBackground: true,
        margin: { top: '0.6in', right: '0.6in', bottom: '0.6in', left: '0.6in' },
        preferCSSPageSize: true,
      });

      const bytes = pdfBuffer instanceof Uint8Array ? pdfBuffer : new Uint8Array(pdfBuffer);
      if (!isPdfBytes(bytes)) {
        return { ok: false, retryable: true, error: 'PDF generation returned invalid output.' };
      }
      if (bytes.byteLength > MAX_PDF_BYTES) {
        return { ok: false, retryable: false, error: 'Generated PDF exceeds size limit.' };
      }
      if (bytes.byteLength < 100) {
        return { ok: false, retryable: true, error: 'Generated PDF was empty.' };
      }
      return { ok: true, bytes };
    } finally {
      await browser.close().catch(() => undefined);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'pdf-render-failed';
    const retryable = !/invalid|unsupported|not configured/i.test(message);
    return {
      ok: false,
      retryable,
      error: 'PDF generation is temporarily unavailable.',
    };
  }
}

/** Test-only helper: build a minimal valid PDF containing plain text lines. */
export function buildMinimalTextPdf(lines: string[]): Uint8Array {
  const safe = lines
    .map((line) => line.replace(/[()\\]/g, ' ').slice(0, 100))
    .slice(0, 40);
  const contentLines = ['BT /F1 11 Tf 50 740 Td 14 TL'];
  safe.forEach((line, index) => {
    if (index === 0) contentLines.push(`(${line}) Tj`);
    else contentLines.push(`T* (${line}) Tj`);
  });
  contentLines.push('ET');
  const stream = contentLines.join('\n');
  const objects = [
    '1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n',
    '2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n',
    '3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>endobj\n',
    `4 0 obj<< /Length ${stream.length} >>stream\n${stream}\nendstream\nendobj\n`,
    '5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += obj;
  }
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

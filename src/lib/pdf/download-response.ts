/**
 * Stream a private PDF with safe download headers.
 */

export function pdfDownloadResponse(
  bytes: Uint8Array,
  filename: string,
): Response {
  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename.replace(/"/g, '')}"`,
      'Content-Length': String(bytes.byteLength),
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

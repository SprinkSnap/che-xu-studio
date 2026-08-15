/**
 * PDF types and helpers.
 */

export type PdfRenderResult =
  | { ok: true; bytes: Uint8Array }
  | { ok: false; retryable: boolean; error: string };

export type DocumentRecordStatus = 'pending' | 'ready' | 'failed' | 'superseded';

export type CanonicalDocumentRow = {
  id: string;
  resource_type: 'proposal' | 'invoice' | 'receipt';
  resource_id: string;
  version_id: string | null;
  document_type: 'proposal_pdf' | 'invoice_pdf' | 'receipt_pdf';
  storage_bucket: string;
  storage_path: string;
  mime_type: string;
  file_size: number | null;
  checksum: string | null;
  status: DocumentRecordStatus;
  generation_version: number;
  renderer_version: string;
  is_canonical: boolean;
  generated_at: string;
  created_at: string;
};

export function isPdfBytes(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 5) return false;
  return (
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  ); // %PDF-
}

export function sanitizePdfFilenamePart(value: string, max = 48): string {
  return value
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, max);
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

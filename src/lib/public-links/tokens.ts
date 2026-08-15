/**
 * Cryptographically secure public capability tokens.
 * 256-bit entropy → URL-safe base64 → SHA-256 hash for storage.
 * Never persist or log the raw token.
 */

const TOKEN_BYTES = 32; // 256 bits

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  // Prefer btoa (Workers/browser). Node fallback via globalThis.
  const btoaFn =
    typeof btoa === 'function'
      ? btoa
      : (value: string) => {
          const nodeBuffer = (globalThis as { Buffer?: { from: (s: string, enc: string) => { toString: (enc: string) => string } } }).Buffer;
          if (!nodeBuffer) throw new Error('No base64 encoder available');
          return nodeBuffer.from(value, 'binary').toString('base64');
        };
  const base64 = btoaFn(binary);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function hexFromBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = '';
  for (let i = 0; i < bytes.length; i += 1) {
    hex += bytes[i]!.toString(16).padStart(2, '0');
  }
  return hex;
}

/** Generate a URL-safe high-entropy capability token (256 bits). */
export function generateSecureToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

/** SHA-256 hex digest of a raw token. Store only this value. */
export async function hashPublicToken(rawToken: string): Promise<string> {
  const encoded = new TextEncoder().encode(rawToken);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return hexFromBuffer(digest);
}

/** Constant-time string equality for equal-length hex digests. */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/** Redact token path segments for logs: /proposal/[REDACTED] */
export function redactProposalTokenPath(pathname: string): string {
  return pathname.replace(
    /^(\/proposal\/)[^/]+/i,
    '$1[REDACTED]',
  ).replace(
    /^(\/invoice\/)[^/]+/i,
    '$1[REDACTED]',
  );
}

export const PUBLIC_TOKEN_MIN_LENGTH = 40;

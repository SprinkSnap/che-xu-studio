/**
 * Deliverability helpers for outbound Studio mail (Resend → Microsoft/Hotmail).
 */

/** Consumer Microsoft mailboxes that aggressively junk cold transactional mail. */
const MICROSOFT_CONSUMER_HOSTS = new Set([
  'hotmail.com',
  'outlook.com',
  'live.com',
  'msn.com',
  'outlook.ca',
  'hotmail.ca',
  'live.ca',
]);

export function recipientEmailHost(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 0) return '';
  return email.slice(at + 1).trim().toLowerCase();
}

export function isMicrosoftConsumerMailbox(email: string): boolean {
  return MICROSOFT_CONSUMER_HOSTS.has(recipientEmailHost(email));
}

/**
 * Headers that mark the message as machine-generated transactional mail
 * (not a bulk newsletter). Forwarded via Resend `headers`.
 */
export function transactionalDeliveryHeaders(refId: string): Record<string, string> {
  const ref = refId.replace(/[^\w.:@-]+/g, '-').slice(0, 120);
  return {
    'Auto-Submitted': 'auto-generated',
    'X-Auto-Response-Suppress': 'OOF, AutoReply',
    'X-Entity-Ref-ID': ref || `studio-${Date.now()}`,
  };
}

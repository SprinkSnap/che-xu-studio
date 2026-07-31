import type { ContactInput } from './validation';

export type NotifyEmailEnv = {
  RESEND_API_KEY?: string;
  /** Verified sender, e.g. "Che Xu Studio <info@chexustudio.com>" */
  CONTACT_FROM_EMAIL?: string;
  /** Inbox that receives lead alerts. Defaults to site contact email. */
  CONTACT_NOTIFY_EMAIL?: string;
};

export function buildLeadNotificationContent(
  lead: ContactInput,
  options: { leadId: string; createdAt: string },
): { subject: string; text: string; html: string } {
  const subject = `New enquiry: ${lead.serviceInterest} — ${lead.name}`;
  const lines = [
    'New Che Xu Studio contact form submission',
    '',
    `Lead ID: ${options.leadId}`,
    `Received: ${options.createdAt}`,
    '',
    `Name: ${lead.name}`,
    `Email: ${lead.email}`,
    lead.phone ? `Phone: ${lead.phone}` : null,
    `Service interest: ${lead.serviceInterest}`,
    `Marketing consent: ${lead.marketingConsent ? 'yes' : 'no'}`,
    lead.preferredContact ? `Preferred contact: ${lead.preferredContact}` : null,
    '',
    'Message:',
    lead.message,
    lead.currentWebsite ? `\nCurrent website: ${lead.currentWebsite}` : null,
    lead.businessType ? `Business type: ${lead.businessType}` : null,
    lead.primaryGoal ? `Primary goal: ${lead.primaryGoal}` : null,
    lead.pagesFeatures ? `Pages / features: ${lead.pagesFeatures}` : null,
    lead.budgetRange ? `Budget range: ${lead.budgetRange}` : null,
    lead.targetTimeline ? `Timeline: ${lead.targetTimeline}` : null,
  ].filter((line): line is string => line !== null);

  const text = lines.join('\n');
  const html = `<pre style="font-family:ui-sans-serif,system-ui,sans-serif;white-space:pre-wrap;line-height:1.5">${escapeHtml(text)}</pre>`;

  return { subject, text, html };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * Notify the studio inbox via Resend. Never throws — form success must not depend on email.
 */
export async function notifyLeadByEmail(
  env: NotifyEmailEnv,
  lead: ContactInput,
  options: { leadId: string; createdAt: string; notifyTo: string },
): Promise<{ sent: boolean; error?: string }> {
  const apiKey = env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.warn('[notify-email] RESEND_API_KEY not set; skipping email notification');
    return { sent: false, error: 'not-configured' };
  }

  const from =
    env.CONTACT_FROM_EMAIL?.trim() || 'Che Xu Studio <onboarding@resend.dev>';
  const to = (env.CONTACT_NOTIFY_EMAIL?.trim() || options.notifyTo).trim();
  if (!to) {
    return { sent: false, error: 'no-recipient' };
  }

  const content = buildLeadNotificationContent(lead, options);

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'che-xu-studio-worker',
      },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: lead.email,
        subject: content.subject,
        text: content.text,
        html: content.html,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error('[notify-email] Resend error', response.status, body.slice(0, 500));
      return { sent: false, error: `resend-${response.status}` };
    }

    return { sent: true };
  } catch (err) {
    console.error(
      '[notify-email] Failed to send',
      err instanceof Error ? err.message : 'unknown',
    );
    return { sent: false, error: 'network' };
  }
}

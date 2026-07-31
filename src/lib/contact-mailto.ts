/** Build a mailto URL so visitors can still reach the studio if the API is unavailable. */

export function buildContactMailto(
  email: string,
  values: {
    name: string;
    email: string;
    phone?: string;
    serviceInterest: string;
    message: string;
    currentWebsite?: string;
    businessType?: string;
    primaryGoal?: string;
    pagesFeatures?: string;
    budgetRange?: string;
    targetTimeline?: string;
    preferredContact?: string;
  },
): string {
  const subject = `Che Xu Studio enquiry — ${values.serviceInterest || 'general'}`;
  const lines = [
    `Name: ${values.name}`,
    `Email: ${values.email}`,
    values.phone ? `Phone: ${values.phone}` : null,
    `Service interest: ${values.serviceInterest}`,
    '',
    'Message:',
    values.message,
    values.currentWebsite ? `\nCurrent website: ${values.currentWebsite}` : null,
    values.businessType ? `Business type: ${values.businessType}` : null,
    values.primaryGoal ? `Primary goal: ${values.primaryGoal}` : null,
    values.pagesFeatures ? `Pages / features: ${values.pagesFeatures}` : null,
    values.budgetRange ? `Budget range: ${values.budgetRange}` : null,
    values.targetTimeline ? `Timeline: ${values.targetTimeline}` : null,
    values.preferredContact ? `Preferred contact: ${values.preferredContact}` : null,
  ].filter((line): line is string => line !== null);

  const params = new URLSearchParams({
    subject,
    body: lines.join('\n'),
  });

  return `mailto:${email}?${params.toString()}`;
}

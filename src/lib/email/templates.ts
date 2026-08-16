/**
 * Transactional email templates — HTML + plain text.
 */

import { formatMoney } from '../clients/format';
import type { CurrencyCode } from '../supabase/domain';
import { sanitizeEmailSubject } from './config';
import { escapeText, paragraph, strongLine, wrapBrandedEmail } from './render';
import type { RenderedEmail } from './types';

function money(minor: number, currency: CurrencyCode | string): string {
  return formatMoney(minor, (currency as CurrencyCode) || 'CAD');
}

export function renderProposalDeliveryEmail(input: {
  contactName: string;
  projectName: string;
  proposalNumber: string;
  proposalTitle: string;
  expiresAt: string | null;
  totalLabel?: string | null;
  reviewUrl: string;
}): RenderedEmail {
  const subject = sanitizeEmailSubject(
    `Your proposal ${input.proposalNumber} from Che Xu Studio`,
  );
  const greeting = input.contactName ? `Hello ${input.contactName},` : 'Hello,';
  const expireLine = input.expiresAt
    ? `This proposal link is available until ${input.expiresAt}.`
    : null;

  const bodyHtml = [
    paragraph(greeting),
    paragraph(
      `Here is your proposal for ${input.projectName}. Use the secure link below to review the exact version and respond.`,
    ),
    strongLine('Proposal', `${input.proposalNumber} — ${input.proposalTitle}`),
    input.totalLabel ? strongLine('Total', input.totalLabel) : '',
    expireLine ? paragraph(expireLine) : '',
    paragraph('If you have questions, reply directly to this email.'),
  ].join('');

  const text = [
    greeting,
    '',
    `Here is your proposal for ${escapeText(input.projectName)}.`,
    `Proposal: ${input.proposalNumber} — ${input.proposalTitle}`,
    input.totalLabel ? `Total: ${input.totalLabel}` : null,
    expireLine,
    '',
    `Review your proposal: ${input.reviewUrl}`,
    '',
    'This is a transactional message from Che Xu Studio.',
    'Reply to this email if you have questions.',
  ]
    .filter(Boolean)
    .join('\n');

  return {
    subject,
    text,
    html: wrapBrandedEmail({
      previewText: `Your proposal ${input.proposalNumber} is ready to review`,
      heading: 'Your proposal',
      bodyHtml,
      ctaLabel: 'Open your proposal',
      ctaUrl: input.reviewUrl,
      ctaStyle: 'link',
      layout: 'plain',
      footerNote:
        'Che Xu Studio · Transactional proposal delivery · Reply to this email with questions.',
    }),
  };
}

export function renderInvoiceDeliveryEmail(input: {
  contactName: string;
  invoiceNumber: string;
  projectName: string | null;
  totalMinor: number;
  balanceDueMinor: number;
  currency: string;
  dueDate: string | null;
  viewUrl: string;
}): RenderedEmail {
  const subject = sanitizeEmailSubject(
    `Your invoice ${input.invoiceNumber} from Che Xu Studio`,
  );
  const greeting = input.contactName ? `Hello ${input.contactName},` : 'Hello,';
  const balance = money(input.balanceDueMinor, input.currency);

  const bodyHtml = [
    paragraph(greeting),
    paragraph(
      'Here is your invoice from Che Xu Studio. Use the secure link below to view details and pay online.',
    ),
    strongLine('Invoice', input.invoiceNumber),
    input.projectName ? strongLine('Project', input.projectName) : '',
    strongLine('Total', money(input.totalMinor, input.currency)),
    strongLine('Balance due', balance),
    input.dueDate ? strongLine('Due date', input.dueDate) : '',
    paragraph('If you have questions, reply directly to this email.'),
  ].join('');

  const text = [
    greeting,
    '',
    'Here is your invoice from Che Xu Studio.',
    `Invoice: ${input.invoiceNumber}`,
    input.projectName ? `Project: ${input.projectName}` : null,
    `Total: ${money(input.totalMinor, input.currency)}`,
    `Balance due: ${balance}`,
    input.dueDate ? `Due date: ${input.dueDate}` : null,
    '',
    `Open your invoice: ${input.viewUrl}`,
    '',
    'This is a transactional message from Che Xu Studio.',
    'Reply to this email if you have questions.',
  ]
    .filter(Boolean)
    .join('\n');

  return {
    subject,
    text,
    html: wrapBrandedEmail({
      previewText: `Your invoice ${input.invoiceNumber} — balance due ${balance}`,
      heading: 'Your invoice',
      bodyHtml,
      ctaLabel: 'Open your invoice',
      ctaUrl: input.viewUrl,
      ctaStyle: 'link',
      layout: 'plain',
      footerNote:
        'Che Xu Studio · Transactional invoice delivery · Reply to this email with questions.',
    }),
  };
}

export function renderPaymentConfirmationEmail(input: {
  contactName: string;
  invoiceNumber: string;
  amountMinor: number;
  balanceDueMinor: number;
  currency: string;
  paidAtLabel: string;
  projectName: string | null;
  paymentMethod: string | null;
  invoiceUrl: string | null;
  depositActivated?: boolean;
  finalCompleted?: boolean;
}): RenderedEmail {
  const subject = sanitizeEmailSubject(
    `Payment received — Invoice ${input.invoiceNumber}`,
  );
  const greeting = input.contactName ? `Hello ${input.contactName},` : 'Hello,';
  const amount = money(input.amountMinor, input.currency);
  const remaining = money(input.balanceDueMinor, input.currency);
  const fullyPaid = input.balanceDueMinor <= 0;

  let statusNote =
    'Thank you — we have received your payment.';
  if (fullyPaid && input.depositActivated) {
    statusNote = 'Your deposit has been received. Your project is now active.';
  } else if (fullyPaid && input.finalCompleted) {
    statusNote = 'Final payment received. Thank you for working with Che Xu Studio.';
  } else if (!fullyPaid) {
    statusNote = `Payment received: ${amount}. Remaining balance: ${remaining}.`;
  }

  const bodyHtml = [
    paragraph(greeting),
    paragraph(statusNote),
    strongLine('Invoice', input.invoiceNumber),
    strongLine('Amount received', amount),
    strongLine('Payment date', input.paidAtLabel),
    input.paymentMethod ? strongLine('Method', input.paymentMethod) : '',
    input.projectName ? strongLine('Project', input.projectName) : '',
    !fullyPaid ? strongLine('Remaining balance', remaining) : '',
  ].join('');

  const text = [
    greeting,
    '',
    statusNote,
    `Invoice: ${input.invoiceNumber}`,
    `Amount received: ${amount}`,
    `Payment date: ${input.paidAtLabel}`,
    input.paymentMethod ? `Method: ${input.paymentMethod}` : null,
    input.projectName ? `Project: ${input.projectName}` : null,
    !fullyPaid ? `Remaining balance: ${remaining}` : null,
    input.invoiceUrl ? `\nView invoice: ${input.invoiceUrl}` : null,
    '',
    'Che Xu Studio',
  ]
    .filter(Boolean)
    .join('\n');

  return {
    subject,
    text,
    html: wrapBrandedEmail({
      previewText: `Payment received for invoice ${input.invoiceNumber}`,
      heading: 'Payment received',
      bodyHtml,
      ctaLabel: input.invoiceUrl ? 'View Invoice' : undefined,
      ctaUrl: input.invoiceUrl || undefined,
    }),
  };
}

export function renderReminderEmail(input: {
  kind: 'before_due' | 'due_today' | 'overdue';
  contactName: string;
  invoiceNumber: string;
  balanceDueMinor: number;
  currency: string;
  dueDate: string | null;
  projectName: string | null;
  days: number | null;
  viewUrl: string;
}): RenderedEmail {
  const balance = money(input.balanceDueMinor, input.currency);
  let subject: string;
  let heading: string;
  let lead: string;

  if (input.kind === 'before_due') {
    subject = sanitizeEmailSubject(
      `Reminder: Invoice ${input.invoiceNumber} is due soon`,
    );
    heading = 'Invoice due soon';
    lead = `This is a friendly reminder that invoice ${input.invoiceNumber} is due${input.days != null ? ` in ${input.days} day${input.days === 1 ? '' : 's'}` : ' soon'}.`;
  } else if (input.kind === 'due_today') {
    subject = sanitizeEmailSubject(`Invoice ${input.invoiceNumber} is due today`);
    heading = 'Invoice due today';
    lead = `Invoice ${input.invoiceNumber} is due today.`;
  } else {
    subject = sanitizeEmailSubject(
      `Reminder: Invoice ${input.invoiceNumber} is overdue`,
    );
    heading = 'Invoice overdue';
    lead = `Invoice ${input.invoiceNumber} is overdue. If you have already paid, please disregard this note — otherwise reply if you need help.`;
  }

  const greeting = input.contactName ? `Hello ${input.contactName},` : 'Hello,';
  const bodyHtml = [
    paragraph(greeting),
    paragraph(lead),
    strongLine('Invoice', input.invoiceNumber),
    input.projectName ? strongLine('Project', input.projectName) : '',
    strongLine('Balance due', balance),
    input.dueDate ? strongLine('Due date', input.dueDate) : '',
  ].join('');

  const text = [
    greeting,
    '',
    lead,
    `Invoice: ${input.invoiceNumber}`,
    input.projectName ? `Project: ${input.projectName}` : null,
    `Balance due: ${balance}`,
    input.dueDate ? `Due date: ${input.dueDate}` : null,
    '',
    `Open your invoice: ${input.viewUrl}`,
    '',
    'This is a transactional message from Che Xu Studio.',
    'Reply to this email if you have questions.',
  ]
    .filter(Boolean)
    .join('\n');

  return {
    subject,
    text,
    html: wrapBrandedEmail({
      previewText: lead,
      heading,
      bodyHtml,
      ctaLabel: 'Open your invoice',
      ctaUrl: input.viewUrl,
      ctaStyle: 'link',
      layout: 'plain',
      footerNote:
        'Che Xu Studio · Transactional payment reminder · Reply to this email with questions.',
    }),
  };
}

export function renderInternalNotificationEmail(input: {
  title: string;
  lines: Array<{ label: string; value: string }>;
  adminUrl: string;
  intro?: string;
}): RenderedEmail {
  const subject = sanitizeEmailSubject(input.title);
  const bodyHtml = [
    input.intro ? paragraph(input.intro) : '',
    ...input.lines.map((line) => strongLine(line.label, line.value)),
  ].join('');

  const text = [
    input.intro || input.title,
    '',
    ...input.lines.map((l) => `${l.label}: ${l.value}`),
    '',
    `Open in Studio: ${input.adminUrl}`,
  ].join('\n');

  return {
    subject,
    text,
    html: wrapBrandedEmail({
      previewText: input.title,
      heading: input.title,
      bodyHtml,
      ctaLabel: 'Open in Studio',
      ctaUrl: input.adminUrl,
      footerNote: 'Internal Che Xu Studio notification.',
    }),
  };
}

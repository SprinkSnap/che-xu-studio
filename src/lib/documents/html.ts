/**
 * Escape + HTML builders for print/PDF documents.
 * Dynamic content is always escaped — never inject raw client HTML.
 */

import { formatMoney } from '../clients/format';
import type {
  InvoiceDocumentViewModel,
  ProposalDocumentViewModel,
  ReceiptDocumentViewModel,
} from './types';

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function money(minor: number, currency: string): string {
  return escapeHtml(formatMoney(minor, currency as 'CAD' | 'USD'));
}

function multiline(text: string): string {
  return escapeHtml(text).replace(/\n/g, '<br />');
}

const PRINT_CSS = `
  @page { size: Letter; margin: 0.6in; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    color: #0B1F33;
    font-family: "DM Sans", "Helvetica Neue", Helvetica, Arial, sans-serif;
    font-size: 11pt;
    line-height: 1.45;
    background: #ffffff;
  }
  h1, h2, .brand {
    font-family: "Source Serif 4", "Georgia", "Times New Roman", serif;
    font-weight: 600;
    color: #0B1F33;
  }
  h1 { font-size: 22pt; margin: 0 0 8pt; }
  h2 { font-size: 13pt; margin: 18pt 0 6pt; border-bottom: 1px solid #D7DEE7; padding-bottom: 4pt; }
  .brand { font-size: 16pt; margin: 0; }
  .muted { color: #5B6B7C; font-size: 9.5pt; }
  .meta { margin: 0 0 4pt; }
  table { width: 100%; border-collapse: collapse; margin: 10pt 0 14pt; }
  th, td { text-align: left; padding: 6pt 4pt; vertical-align: top; }
  th { font-size: 9pt; text-transform: uppercase; letter-spacing: 0.04em; color: #5B6B7C; border-bottom: 1px solid #D7DEE7; }
  td { border-bottom: 1px solid #EEF2F6; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .totals { width: 280px; margin-left: auto; }
  .totals td { border: 0; padding: 3pt 0; }
  .totals .grand { font-weight: 700; font-size: 12pt; padding-top: 8pt; border-top: 1px solid #0B1F33; }
  .section-body { white-space: pre-wrap; margin: 0 0 8pt; }
  .closing { margin-top: 28pt; padding-top: 10pt; border-top: 1px solid #D7DEE7; color: #5B6B7C; font-size: 9.5pt; }
  .no-print, .studio-doc-no-print { display: none !important; }
  a { color: #0B1F33; text-decoration: none; }
  header { margin-bottom: 18pt; }
`;

function wrapDocumentHtml(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="robots" content="noindex,nofollow,noarchive" />
  <title>${escapeHtml(title)}</title>
  <style>${PRINT_CSS}</style>
</head>
<body data-pdf-ready="pending">
  ${body}
  <script>
    (async function () {
      try {
        if (document.fonts && document.fonts.ready) await document.fonts.ready;
      } catch (e) {}
      document.body.setAttribute('data-pdf-ready', 'true');
    })();
  </script>
</body>
</html>`;
}

export function renderProposalDocumentHtml(vm: ProposalDocumentViewModel): string {
  const items = vm.items
    .map(
      (row) => `<tr>
      <td>${escapeHtml(row.description)}</td>
      <td class="num">${escapeHtml(row.quantityLabel)}</td>
      <td class="num">${money(row.rateMinor, vm.currency)}</td>
      <td class="num">${money(row.amountMinor, vm.currency)}</td>
    </tr>`,
    )
    .join('');

  const sections = vm.sections
    .map(
      (s) => `<section>
      <h2>${escapeHtml(s.heading)}</h2>
      <p class="section-body">${multiline(s.body)}</p>
    </section>`,
    )
    .join('');

  const body = `
  <header>
    <p class="brand">Che Xu Studio</p>
    <p class="muted meta">Proposal ${escapeHtml(vm.proposalNumber)} · Version ${vm.versionNumber}</p>
  </header>
  <h1>${escapeHtml(vm.title)}</h1>
  <p class="meta"><strong>Client:</strong> ${escapeHtml(vm.clientDisplayName)}</p>
  <p class="meta"><strong>Project:</strong> ${escapeHtml(vm.projectName)}</p>
  ${vm.expiresAtLabel ? `<p class="meta muted">Available until ${escapeHtml(vm.expiresAtLabel)}</p>` : ''}
  ${sections}
  <h2>Investment</h2>
  <table>
    <thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead>
    <tbody>${items}</tbody>
  </table>
  <table class="totals">
    <tr><td>Subtotal</td><td class="num">${money(vm.subtotalMinor, vm.currency)}</td></tr>
    ${vm.discountMinor ? `<tr><td>Discount</td><td class="num">−${money(vm.discountMinor, vm.currency)}</td></tr>` : ''}
    <tr><td>Tax (${escapeHtml(vm.taxPercentLabel)}%)</td><td class="num">${money(vm.taxMinor, vm.currency)}</td></tr>
    <tr class="grand"><td>Total</td><td class="num">${money(vm.totalMinor, vm.currency)}</td></tr>
  </table>
  <p class="closing">${escapeHtml(vm.closingLine)}</p>`;

  return wrapDocumentHtml(`Proposal ${vm.proposalNumber}`, body);
}

export function renderInvoiceDocumentHtml(vm: InvoiceDocumentViewModel): string {
  const items = vm.items
    .map(
      (row) => `<tr>
      <td>${escapeHtml(row.description)}</td>
      <td class="num">${escapeHtml(row.quantityLabel)}</td>
      <td class="num">${money(row.rateMinor, vm.currency)}</td>
      <td class="num">${money(row.amountMinor, vm.currency)}</td>
    </tr>`,
    )
    .join('');

  const body = `
  <header>
    <p class="brand">${escapeHtml(vm.studioBusinessName || 'Che Xu Studio')}</p>
    ${vm.studioBusinessAddress ? `<p class="muted">${multiline(vm.studioBusinessAddress)}</p>` : ''}
    ${vm.studioBillingEmail ? `<p class="muted">${escapeHtml(vm.studioBillingEmail)}</p>` : ''}
  </header>
  <h1>Invoice ${escapeHtml(vm.invoiceNumber)}</h1>
  <p class="meta muted">${escapeHtml(vm.invoiceTypeLabel)} · ${escapeHtml(vm.statusLabel)}</p>
  <p class="meta"><strong>Bill to:</strong> ${escapeHtml(vm.clientDisplayName)}</p>
  ${vm.clientContactName ? `<p class="meta muted">${escapeHtml(vm.clientContactName)}</p>` : ''}
  ${vm.clientContactEmail ? `<p class="meta muted">${escapeHtml(vm.clientContactEmail)}</p>` : ''}
  ${vm.clientBillingAddress ? `<p class="meta muted">${multiline(vm.clientBillingAddress)}</p>` : ''}
  ${vm.projectName ? `<p class="meta"><strong>Project:</strong> ${escapeHtml(vm.projectName)}</p>` : ''}
  ${vm.issueDateLabel ? `<p class="meta"><strong>Issue date:</strong> ${escapeHtml(vm.issueDateLabel)}</p>` : ''}
  ${vm.dueDateLabel ? `<p class="meta"><strong>Due date:</strong> ${escapeHtml(vm.dueDateLabel)}</p>` : ''}
  <table>
    <thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead>
    <tbody>${items}</tbody>
  </table>
  <table class="totals">
    <tr><td>Subtotal</td><td class="num">${money(vm.subtotalMinor, vm.currency)}</td></tr>
    ${vm.discountMinor ? `<tr><td>Discount</td><td class="num">−${money(vm.discountMinor, vm.currency)}</td></tr>` : ''}
    <tr><td>Tax (${escapeHtml(vm.taxPercentLabel)}%)</td><td class="num">${money(vm.taxMinor, vm.currency)}</td></tr>
    <tr class="grand"><td>Total</td><td class="num">${money(vm.totalMinor, vm.currency)}</td></tr>
    <tr><td>Amount paid</td><td class="num">${money(vm.amountPaidMinor, vm.currency)}</td></tr>
    <tr><td>Balance due</td><td class="num">${money(vm.balanceDueMinor, vm.currency)}</td></tr>
  </table>
  ${vm.paymentInstructions ? `<h2>Payment instructions</h2><p class="section-body">${multiline(vm.paymentInstructions)}</p>` : ''}
  <p class="closing">This invoice is issued by Che Xu Studio. Pay securely via the online invoice link when provided.</p>`;

  return wrapDocumentHtml(`Invoice ${vm.invoiceNumber}`, body);
}

export function renderReceiptDocumentHtml(vm: ReceiptDocumentViewModel): string {
  const body = `
  <header>
    <p class="brand">${escapeHtml(vm.studioBusinessName || 'Che Xu Studio')}</p>
    ${vm.studioBillingEmail ? `<p class="muted">${escapeHtml(vm.studioBillingEmail)}</p>` : ''}
  </header>
  <h1>${escapeHtml(vm.title)}</h1>
  <p class="meta muted">Reference ${escapeHtml(vm.paymentReference)}</p>
  <p class="meta"><strong>Client:</strong> ${escapeHtml(vm.clientDisplayName)}</p>
  ${vm.projectName ? `<p class="meta"><strong>Project:</strong> ${escapeHtml(vm.projectName)}</p>` : ''}
  <p class="meta"><strong>Invoice:</strong> ${escapeHtml(vm.invoiceNumber)}</p>
  <p class="meta"><strong>Payment date:</strong> ${escapeHtml(vm.paidAtLabel)}</p>
  ${vm.paymentMethod ? `<p class="meta"><strong>Method:</strong> ${escapeHtml(vm.paymentMethod)}</p>` : ''}
  <table class="totals" style="margin-top:18pt">
    <tr><td>Invoice total</td><td class="num">${money(vm.invoiceTotalMinor, vm.currency)}</td></tr>
    <tr class="grand"><td>Amount received</td><td class="num">${money(vm.amountReceivedMinor, vm.currency)}</td></tr>
    <tr><td>Remaining balance</td><td class="num">${money(vm.balanceDueMinor, vm.currency)}</td></tr>
  </table>
  <p class="closing">${escapeHtml(vm.closingLine)}</p>`;

  return wrapDocumentHtml(`Receipt ${vm.invoiceNumber}`, body);
}

import { describe, expect, it } from 'vitest';
import { buildProposalDocumentViewModel } from '../../src/lib/documents/proposal-view-model';
import { buildInvoiceDocumentViewModel } from '../../src/lib/documents/invoice-view-model';
import { buildReceiptDocumentViewModel } from '../../src/lib/documents/receipt-view-model';
import {
  escapeHtml,
  renderProposalDocumentHtml,
  renderInvoiceDocumentHtml,
  renderReceiptDocumentHtml,
} from '../../src/lib/documents/html';
import {
  isPdfBytes,
  sanitizePdfFilenamePart,
  sha256Hex,
} from '../../src/lib/pdf/types';
import { proposalPdfFilename, invoicePdfFilename, receiptPdfFilename } from '../../src/lib/pdf/filenames';
import { buildMinimalTextPdf } from '../../src/lib/pdf/renderer';
import {
  buildProposalStoragePath,
  buildInvoiceStoragePath,
  buildReceiptStoragePath,
} from '../../src/lib/pdf/storage';

describe('document view models', () => {
  it('builds proposal model from version snapshot without internal fields', () => {
    const vm = buildProposalDocumentViewModel({
      proposalNumber: 'CXS-P-2026-001',
      versionNumber: 2,
      title: 'Website redesign',
      clientDisplayName: 'Acme Co',
      projectName: 'Acme Site',
      introduction: 'Hello',
      projectOverview: 'Overview',
      objectives: 'Objectives',
      scope: 'Scope',
      deliverables: 'Deliverables',
      timeline: '4 weeks',
      paymentSchedule: '50/50',
      termsAndConditions: 'Net 15',
      notes: 'Client note',
      items: [
        {
          id: 'i1',
          proposal_version_id: 'v1',
          description: 'Design',
          quantity: 1,
          rate_minor: 100_000,
          amount_minor: 100_000,
          sort_order: 0,
          created_at: '',
          updated_at: '',
          is_optional: false,
        } as never,
      ],
      subtotalMinor: 100_000,
      discountMinor: 0,
      taxMinor: 13_000,
      totalMinor: 113_000,
      taxBps: 1300,
      currency: 'CAD',
      expiresAt: '2026-09-01',
      finalizedAt: '2026-08-01',
    });

    expect(vm.proposalNumber).toBe('CXS-P-2026-001');
    expect(vm.versionNumber).toBe(2);
    expect(vm.totalMinor).toBe(113_000);
    expect(vm.sections.some((s) => s.heading === 'Introduction')).toBe(true);
    expect(JSON.stringify(vm)).not.toMatch(/internal|token|stripe|supabase/i);
  });

  it('builds invoice model with issued commercial amounts', () => {
    const vm = buildInvoiceDocumentViewModel({
      invoiceNumber: 'CXS-2026-001',
      invoiceType: 'deposit',
      statusLabel: 'Issued',
      clientDisplayName: 'Acme',
      clientContactName: 'Pat',
      clientContactEmail: 'pat@example.com',
      clientBillingAddress: '1 Main St',
      projectName: 'Acme Site',
      studioBusinessName: 'Che Xu Studio',
      studioBillingEmail: 'info@chexustudio.com',
      studioBusinessAddress: 'Toronto',
      issueDate: '2026-08-01',
      dueDate: '2026-08-15',
      items: [
        {
          id: 'ii1',
          invoice_id: 'inv1',
          description: 'Deposit',
          quantity: 1,
          rate_minor: 400_000,
          amount_minor: 400_000,
          sort_order: 0,
          created_at: '',
        },
      ],
      subtotalMinor: 400_000,
      discountMinor: 0,
      taxMinor: 52_000,
      taxBps: 1300,
      totalMinor: 452_000,
      amountPaidMinor: 0,
      balanceDueMinor: 452_000,
      currency: 'CAD',
      paymentInstructions: 'Pay online',
    });
    expect(vm.invoiceNumber).toBe('CXS-2026-001');
    expect(vm.balanceDueMinor).toBe(452_000);
    expect(vm.showPayPlaceholder).toBe(false);
  });

  it('marks partial receipts without paid-in-full language', () => {
    const partial = buildReceiptDocumentViewModel({
      invoiceNumber: 'CXS-2026-001',
      paymentId: '11111111-2222-3333-4444-555555555555',
      paidAt: '2026-08-14T15:00:00.000Z',
      clientDisplayName: 'Acme',
      projectName: 'Acme Site',
      studioBusinessName: 'Che Xu Studio',
      studioBillingEmail: null,
      amountReceivedMinor: 200_000,
      invoiceTotalMinor: 452_000,
      balanceDueMinor: 252_000,
      currency: 'CAD',
      paymentMethod: 'Card',
    });
    expect(partial.fullyPaid).toBe(false);
    expect(partial.closingLine).toMatch(/partial/i);
    expect(partial.closingLine).not.toMatch(/paid in full/i);
    expect(partial.paymentReference).toMatch(/^PAY-/);

    const full = buildReceiptDocumentViewModel({
      invoiceNumber: 'CXS-2026-001',
      paymentId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      paidAt: '2026-08-14T15:00:00.000Z',
      clientDisplayName: 'Acme',
      projectName: 'Acme Site',
      studioBusinessName: 'Che Xu Studio',
      studioBillingEmail: null,
      amountReceivedMinor: 452_000,
      invoiceTotalMinor: 452_000,
      balanceDueMinor: 0,
      currency: 'CAD',
      paymentMethod: 'Card',
    });
    expect(full.fullyPaid).toBe(true);
    expect(full.balanceDueMinor).toBe(0);
  });
});

describe('document HTML rendering', () => {
  it('escapes untrusted content and omits interactive controls', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    );

    const proposalHtml = renderProposalDocumentHtml(
      buildProposalDocumentViewModel({
        proposalNumber: 'CXS-P-2026-001',
        versionNumber: 1,
        title: 'Title <b>x</b>',
        clientDisplayName: 'Client',
        projectName: 'Project',
        introduction: 'Intro <img src=x onerror=alert(1)>',
        projectOverview: null,
        objectives: null,
        scope: null,
        deliverables: null,
        timeline: null,
        paymentSchedule: null,
        termsAndConditions: null,
        notes: null,
        items: [],
        subtotalMinor: 100,
        discountMinor: 0,
        taxMinor: 0,
        totalMinor: 100,
        taxBps: 0,
        currency: 'CAD',
        expiresAt: null,
        finalizedAt: '2026-08-01',
      }),
    );

    expect(proposalHtml).toContain('data-pdf-ready');
    expect(proposalHtml).toContain('CXS-P-2026-001');
    expect(proposalHtml).toContain('Version 1');
    expect(proposalHtml).not.toContain('<script>alert');
    expect(proposalHtml).not.toContain('Accept Proposal');
    expect(proposalHtml).not.toContain('Request Changes');
    expect(proposalHtml).not.toMatch(/capability|token_hash|sk_live|supabase/i);

    const invoiceHtml = renderInvoiceDocumentHtml(
      buildInvoiceDocumentViewModel({
        invoiceNumber: 'CXS-2026-001',
        invoiceType: 'final',
        statusLabel: 'Issued',
        clientDisplayName: 'Client',
        clientContactName: null,
        clientContactEmail: null,
        clientBillingAddress: null,
        projectName: 'Project',
        studioBusinessName: 'Che Xu Studio',
        studioBillingEmail: null,
        studioBusinessAddress: null,
        issueDate: '2026-08-01',
        dueDate: '2026-08-15',
        items: [],
        subtotalMinor: 100,
        discountMinor: 0,
        taxMinor: 0,
        taxBps: 0,
        totalMinor: 100,
        amountPaidMinor: 0,
        balanceDueMinor: 100,
        currency: 'CAD',
        paymentInstructions: null,
      }),
    );
    expect(invoiceHtml).toContain('Invoice CXS-2026-001');
    expect(invoiceHtml).not.toContain('Pay Invoice');

    const receiptHtml = renderReceiptDocumentHtml(
      buildReceiptDocumentViewModel({
        invoiceNumber: 'CXS-2026-001',
        paymentId: '11111111-2222-3333-4444-555555555555',
        paidAt: '2026-08-14T12:00:00.000Z',
        clientDisplayName: 'Client',
        projectName: 'Project',
        studioBusinessName: 'Che Xu Studio',
        studioBillingEmail: null,
        amountReceivedMinor: 100,
        invoiceTotalMinor: 100,
        balanceDueMinor: 0,
        currency: 'CAD',
        paymentMethod: 'Card',
      }),
    );
    expect(receiptHtml).toContain('Payment Receipt');
    expect(receiptHtml).not.toMatch(/pi_|sk_|whsec_/);
  });
});

describe('pdf helpers', () => {
  it('validates PDF magic bytes and builds minimal fixtures', () => {
    const pdf = buildMinimalTextPdf(['Proposal CXS-P-2026-001', 'Version 2', 'Total 113.00']);
    expect(isPdfBytes(pdf)).toBe(true);
    expect(pdf.byteLength).toBeGreaterThan(100);
    const text = new TextDecoder().decode(pdf);
    expect(text).toContain('%PDF');
    expect(text).toContain('CXS-P-2026-001');
    expect(isPdfBytes(new TextEncoder().encode('<html>not pdf</html>'))).toBe(false);
  });

  it('sanitizes filenames without tokens or emails', () => {
    expect(proposalPdfFilename('CXS-P-2026-001', 2)).toBe(
      'Che-Xu-Studio-Proposal-CXS-P-2026-001-v2.pdf',
    );
    expect(invoicePdfFilename('CXS-2026-001')).toBe('Che-Xu-Studio-Invoice-CXS-2026-001.pdf');
    expect(receiptPdfFilename('CXS-2026-001', '2026-08-14T15:00:00Z')).toBe(
      'Che-Xu-Studio-Receipt-CXS-2026-001-2026-08-14.pdf',
    );
    expect(sanitizePdfFilenamePart('a/b@c.com?token=abc')).not.toMatch(/@|\?|\//);
  });

  it('builds deterministic private storage paths', () => {
    expect(
      buildProposalStoragePath({
        proposalId: 'p1',
        versionId: 'v1',
        documentId: 'd1',
      }),
    ).toBe('proposals/p1/versions/v1/d1.pdf');
    expect(buildInvoiceStoragePath({ invoiceId: 'i1', documentId: 'd1' })).toBe(
      'invoices/i1/d1.pdf',
    );
    expect(buildReceiptStoragePath({ paymentId: 'pay1', documentId: 'd1' })).toBe(
      'receipts/pay1/d1.pdf',
    );
  });

  it('computes sha256 checksums', async () => {
    const bytes = buildMinimalTextPdf(['checksum']);
    const hex = await sha256Hex(bytes);
    expect(hex).toMatch(/^[a-f0-9]{64}$/);
    expect(await sha256Hex(bytes)).toBe(hex);
  });
});

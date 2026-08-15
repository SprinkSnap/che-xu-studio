import { sanitizePdfFilenamePart } from './types';

export function proposalPdfFilename(proposalNumber: string, versionNumber: number): string {
  return `Che-Xu-Studio-Proposal-${sanitizePdfFilenamePart(proposalNumber)}-v${versionNumber}.pdf`;
}

export function invoicePdfFilename(invoiceNumber: string): string {
  return `Che-Xu-Studio-Invoice-${sanitizePdfFilenamePart(invoiceNumber)}.pdf`;
}

export function receiptPdfFilename(invoiceNumber: string, paidAtIso: string | null): string {
  const day = (paidAtIso || new Date().toISOString()).slice(0, 10);
  return `Che-Xu-Studio-Receipt-${sanitizePdfFilenamePart(invoiceNumber)}-${sanitizePdfFilenamePart(day)}.pdf`;
}

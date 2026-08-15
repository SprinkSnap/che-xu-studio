/**
 * Proposal presentation view model — exact Proposal Version snapshot only.
 */

import { formatDateOnly, formatMoney } from '../clients/format';
import { formatScaledQuantity } from '../finance/calculations';
import type { CurrencyCode } from '../supabase/domain';
import type { ProposalItemRow } from '../proposals/types';
import type { ProposalDocumentViewModel } from './types';

function section(heading: string, body: string | null | undefined): { heading: string; body: string } | null {
  const trimmed = body?.trim() || '';
  if (!trimmed) return null;
  return { heading, body: trimmed };
}

export function buildProposalDocumentViewModel(input: {
  proposalNumber: string;
  versionNumber: number;
  title: string;
  clientDisplayName: string;
  projectName: string;
  introduction: string | null;
  projectOverview: string | null;
  objectives: string | null;
  scope: string | null;
  deliverables: string | null;
  timeline: string | null;
  paymentSchedule: string | null;
  termsAndConditions: string | null;
  /** Client-facing notes from the Version snapshot only. */
  notes: string | null;
  items: ProposalItemRow[];
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  taxBps: number;
  currency: CurrencyCode;
  expiresAt: string | null;
  finalizedAt: string | null;
}): ProposalDocumentViewModel {
  const taxPercentLabel = (input.taxBps / 100).toFixed(input.taxBps % 100 === 0 ? 0 : 2);
  const sections = [
    section('Introduction', input.introduction),
    section('Project overview', input.projectOverview),
    section('Objectives', input.objectives),
    section('Scope', input.scope),
    section('Deliverables', input.deliverables),
    section('Timeline', input.timeline),
    section('Payment schedule', input.paymentSchedule),
    section('Terms and conditions', input.termsAndConditions),
    section('Notes', input.notes),
  ].filter((s): s is { heading: string; body: string } => Boolean(s));

  return {
    kind: 'proposal',
    proposalNumber: input.proposalNumber,
    versionNumber: input.versionNumber,
    title: input.title,
    clientDisplayName: input.clientDisplayName,
    projectName: input.projectName,
    sections,
    items: input.items.map((item) => ({
      description: item.description,
      quantityLabel: formatScaledQuantity(Math.round(Number(item.quantity) * 10_000)),
      rateMinor: item.rate_minor,
      amountMinor: item.amount_minor,
    })),
    subtotalMinor: input.subtotalMinor,
    discountMinor: input.discountMinor,
    taxMinor: input.taxMinor,
    totalMinor: input.totalMinor,
    taxPercentLabel,
    currency: input.currency,
    expiresAtLabel: input.expiresAt ? formatDateOnly(input.expiresAt) : null,
    finalizedAtLabel: input.finalizedAt ? formatDateOnly(input.finalizedAt) : null,
    closingLine:
      'This document is a commercial proposal from Che Xu Studio. To accept or request changes, use the secure online proposal link provided by Che Xu Studio.',
  };
}

export function proposalInvestmentLabel(vm: ProposalDocumentViewModel): string {
  return formatMoney(vm.totalMinor, vm.currency);
}

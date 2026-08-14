import { bpsToPercentInput, formatMinorAsMajorInput } from '../money/parse';
import type { ProjectRow } from './types';
import type { StudioSettingsDefaults } from './types';

export type ProjectFormValues = {
  name: string;
  clientId: string;
  projectType: string;
  description: string;
  scope: string;
  deliverables: string;
  startDate: string;
  targetCompletionDate: string;
  projectPrice: string;
  currency: 'CAD' | 'USD';
  taxPercent: string;
  depositPercent: string;
  internalNotes: string;
  expectedUpdatedAt?: string;
};

export function emptyProjectFormValues(
  defaults: StudioSettingsDefaults,
  clientId = '',
): ProjectFormValues {
  return {
    name: '',
    clientId,
    projectType: '',
    description: '',
    scope: '',
    deliverables: '',
    startDate: '',
    targetCompletionDate: '',
    projectPrice: '0.00',
    currency: defaults.defaultCurrency,
    taxPercent: bpsToPercentInput(defaults.defaultTaxBps),
    depositPercent: bpsToPercentInput(defaults.defaultDepositBps),
    internalNotes: '',
  };
}

export function projectRowToFormValues(project: ProjectRow): ProjectFormValues {
  return {
    name: project.name,
    clientId: project.client_id,
    projectType: project.project_type ?? '',
    description: project.description ?? '',
    scope: project.scope ?? '',
    deliverables: project.deliverables ?? '',
    startDate: project.start_date ?? '',
    targetCompletionDate: project.target_completion_date ?? '',
    projectPrice: formatMinorAsMajorInput(project.project_price_minor, project.currency),
    currency: project.currency,
    taxPercent: bpsToPercentInput(project.tax_bps),
    depositPercent: bpsToPercentInput(project.deposit_bps),
    internalNotes: project.internal_notes ?? '',
    expectedUpdatedAt: project.updated_at,
  };
}

/** Informational deposit preview (tax calculated when invoiced). */
export function depositPreview(projectPriceMinor: number, depositBps: number): {
  depositBaseMinor: number;
  remainingMinor: number;
} {
  const depositBaseMinor = Math.trunc((projectPriceMinor * depositBps) / 10_000);
  return {
    depositBaseMinor,
    remainingMinor: projectPriceMinor - depositBaseMinor,
  };
}

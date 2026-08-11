import { getPackageById, type ServicePackage } from '../config/packages';

export type NeedAnswer = 'new-website' | 'branding' | 'growth' | 'care';
export type SeoAnswer = 'yes' | 'no' | 'unsure';

export interface FinderAnswers {
  need?: NeedAnswer;
  seo?: SeoAnswer;
}

export interface PackageRecommendation {
  packageId: string;
  pkg: ServicePackage;
  reason: string;
  alternatives: string[];
}

export function recommendPackage(answers: FinderAnswers): PackageRecommendation | null {
  if (!answers.need) return null;

  if (answers.need === 'care') {
    const pkg = getPackageById('website-care')!;
    return {
      packageId: pkg.id,
      pkg,
      reason:
        'Website Care & Maintenance fits when your site already exists and you want proactive monitoring, maintenance, security, performance checks, and priority technical support so it stays reliable after launch.',
      alternatives: ['seo-growth'],
    };
  }

  if (answers.need === 'growth') {
    const pkg = getPackageById('seo-growth')!;
    return {
      packageId: pkg.id,
      pkg,
      reason:
        'SEO & Conversion Growth is built for existing websites that need ongoing visibility improvements, clearer reporting, and conversion-focused recommendations without a full redesign.',
      alternatives: ['website-care', 'custom-seo-launch'],
    };
  }

  if (answers.need === 'branding') {
    const pkg = getPackageById('brand-identity')!;
    return {
      packageId: pkg.id,
      pkg,
      reason:
        'Brand Identity & Logo Design fits when you need a consistent, professional look—logo, colours, type, and guidelines—before or alongside a custom website build.',
      alternatives: ['custom-website', 'custom-seo-launch'],
    };
  }

  // new website path — ask SEO preference next
  if (answers.seo === undefined) return null;

  const wantsSeo = answers.seo === 'yes' || answers.seo === 'unsure';
  if (wantsSeo) {
    const pkg = getPackageById('custom-seo-launch')!;
    return {
      packageId: pkg.id,
      pkg,
      reason:
        'Custom Website + SEO Launch pairs a from-scratch conversion-focused build with keyword research, technical SEO, on-page setup, tracking, and 30-day post-launch SEO support—so launch and discoverability move together.',
      alternatives: ['custom-website', 'seo-growth'],
    };
  }

  const pkg = getPackageById('custom-website')!;
  return {
    packageId: pkg.id,
    pkg,
    reason:
      'A Custom Website built from scratch fits when brand presentation, UX, and conversion layout matter most, and you prefer to add a fuller SEO program after launch or through a separate monthly plan.',
    alternatives: ['custom-seo-launch', 'brand-identity'],
  };
}

export const finderQuestions = [
  {
    id: 'need',
    prompt: 'What do you need help with right now?',
    options: [
      { value: 'new-website' as const, label: 'A new website', description: 'Custom build from scratch' },
      {
        value: 'branding' as const,
        label: 'Brand identity & logo',
        description: 'Logo, colours, and visual system',
      },
      { value: 'growth' as const, label: 'Growth for an existing website', description: 'SEO and conversions' },
      { value: 'care' as const, label: 'Ongoing website care', description: 'Monitoring, security, support' },
    ],
  },
  {
    id: 'seo',
    prompt: 'Do you need complete SEO setup at launch?',
    options: [
      { value: 'yes' as const, label: 'Yes', description: 'Research, technical SEO, and tracking' },
      { value: 'no' as const, label: 'Not right now', description: 'Focus on the website first' },
      { value: 'unsure' as const, label: 'Not sure', description: 'Recommend the stronger launch path' },
    ],
  },
] as const;

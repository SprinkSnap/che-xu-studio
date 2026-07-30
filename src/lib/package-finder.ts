import { getPackageById, type ServicePackage } from '../config/packages';

export type NeedAnswer = 'new-website' | 'growth' | 'care';
export type DesignAnswer = 'premium-theme' | 'custom';
export type SeoAnswer = 'yes' | 'no' | 'unsure';

export interface FinderAnswers {
  need?: NeedAnswer;
  design?: DesignAnswer;
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
        'Website Care & Maintenance fits when your site already exists and you want proactive updates, backups, security monitoring, and priority support so it stays fast and online.',
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

  // new website path
  if (!answers.design) return null;

  if (answers.design === 'premium-theme') {
    const pkg = getPackageById('premium-theme')!;
    return {
      packageId: pkg.id,
      pkg,
      reason:
        'A Premium Theme Website is a strong fit when you want a professional, mobile-first launch with brand customization and essential SEO setup—without commissioning a fully custom design system.',
      alternatives: ['custom-website', 'custom-seo-launch'],
    };
  }

  // custom design
  const wantsSeo = answers.seo === 'yes' || answers.seo === 'unsure';
  if (answers.seo === undefined) return null;

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
    alternatives: ['custom-seo-launch', 'seo-growth'],
  };
}

export const finderQuestions = [
  {
    id: 'need',
    prompt: 'What do you need help with right now?',
    options: [
      { value: 'new-website' as const, label: 'A new website', description: 'Launch or replace a site' },
      { value: 'growth' as const, label: 'Growth for an existing website', description: 'SEO and conversions' },
      { value: 'care' as const, label: 'Ongoing website care', description: 'Updates, security, uptime' },
    ],
  },
  {
    id: 'design',
    prompt: 'For your new website, which approach do you prefer?',
    options: [
      {
        value: 'premium-theme' as const,
        label: 'Customized premium theme',
        description: 'Faster launch, strong value',
      },
      {
        value: 'custom' as const,
        label: 'Fully custom design',
        description: 'Built from scratch',
      },
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

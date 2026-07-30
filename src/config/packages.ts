/**
 * Single source of truth for service packages.
 * Pricing cards, comparison tables, structured data, and AI chat all read from here.
 */

export type BillingType = 'one_time' | 'monthly';
export type PackageCategory = 'web-design' | 'seo' | 'website-care';
export type AccentTone = 'blue' | 'purple' | 'green' | 'gold';

export interface ServicePackage {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  category: PackageCategory;
  accent: AccentTone;
  billing: BillingType;
  /** Display price in CAD major units (e.g. 1999). */
  startingPriceCad: number;
  priceLabel: string;
  priceSuffix?: string;
  popular?: boolean;
  timeline?: string;
  summary: string;
  disclosures: string[];
  includes: string[];
  href: string;
  serviceHref: string;
}

export const packages: ServicePackage[] = [
  {
    id: 'premium-theme',
    slug: 'premium-theme-website',
    name: 'Premium Theme Website',
    shortName: 'Premium Theme',
    category: 'web-design',
    accent: 'blue',
    billing: 'one_time',
    startingPriceCad: 1999,
    priceLabel: 'CAD $1,999',
    timeline: '2–4 weeks',
    summary:
      'A polished, brand-aligned website built on a premium theme—ideal when you need a professional launch without a fully custom design system.',
    disclosures: [
      'Starting price. Final scope is confirmed after a short discovery conversation.',
      'Premium theme licence is paid by the client at cost, typically CAD $80–$150.',
    ],
    includes: [
      'Premium theme customized to the client’s brand',
      'Up to 5 pages',
      'Mobile responsive',
      'Contact forms',
      'Blog setup',
      'Basic speed optimization',
      'Basic on-page SEO',
      'Google Analytics and Search Console setup',
      'Website launch',
    ],
    href: '/pricing#premium-theme',
    serviceHref: '/services/web-design',
  },
  {
    id: 'custom-website',
    slug: 'custom-website',
    name: 'Custom Website (Built From Scratch)',
    shortName: 'Custom Website',
    category: 'web-design',
    accent: 'purple',
    billing: 'one_time',
    startingPriceCad: 4999,
    priceLabel: 'CAD $4,999',
    timeline: '6–10 weeks',
    summary:
      'A conversion-focused custom WordPress website designed and built from scratch around your brand, offers, and customer journey.',
    disclosures: [
      'Starting price. Complex features, content production, or integrations may change the final quote.',
    ],
    includes: [
      'Discovery and strategy session',
      'Custom UI/UX design',
      'Built from scratch without a commercial theme',
      'Custom WordPress development',
      'Responsive on all devices',
      'Conversion-focused layouts',
      'Performance optimization',
      'SEO-ready architecture',
      'Contact forms',
      'Blog',
      'Analytics integration',
      'Training session',
      'Website launch',
    ],
    href: '/pricing#custom-website',
    serviceHref: '/services/web-design',
  },
  {
    id: 'custom-seo-launch',
    slug: 'custom-website-seo-launch',
    name: 'Custom Website + SEO Launch',
    shortName: 'Custom + SEO Launch',
    category: 'web-design',
    accent: 'purple',
    billing: 'one_time',
    startingPriceCad: 6999,
    priceLabel: 'CAD $6,999',
    popular: true,
    timeline: '8–12 weeks',
    summary:
      'Everything in the Custom Website package plus a complete SEO launch foundation so your new site is ready to get found from day one.',
    disclosures: [
      'Starting price. SEO scope assumes a standard local or service-business footprint; broader markets are quoted separately.',
      'SEO helps improve visibility over time; specific rankings are never guaranteed.',
    ],
    includes: [
      'Everything in Custom Website (Built From Scratch)',
      'Comprehensive keyword research',
      'Local SEO optimization',
      'Technical SEO implementation',
      'On-page SEO for all pages',
      'Meta titles and descriptions',
      'Schema markup',
      'Internal linking strategy',
      'Image optimization',
      'XML sitemap',
      'Google Business Profile optimization',
      'Google Search Console setup',
      'Conversion tracking',
      '30-day post-launch SEO support',
    ],
    href: '/pricing#custom-seo-launch',
    serviceHref: '/services/web-design',
  },
  {
    id: 'seo-growth',
    slug: 'seo-conversion-growth',
    name: 'SEO & Conversion Growth',
    shortName: 'SEO Growth',
    category: 'seo',
    accent: 'green',
    billing: 'monthly',
    startingPriceCad: 499,
    priceLabel: 'CAD $499',
    priceSuffix: '/month',
    timeline: 'Ongoing monthly plan',
    summary:
      'A monthly SEO and conversion program that improves visibility, clarifies next actions, and helps more visitors become customers.',
    disclosures: [
      'Monthly plan. Cancel anytime according to the published cancellation policy.',
      'Results depend on competition, content, and technical health; rankings are not guaranteed.',
    ],
    includes: [
      'Monthly SEO improvements',
      'Keyword rank tracking',
      'On-page and technical SEO',
      'Content optimization',
      'Google Search Console monitoring',
      'Monthly performance report',
      'Conversion-rate optimization',
      'Competitor analysis',
      'Action plan and recommendations',
      'Email and phone support',
    ],
    href: '/pricing#seo-growth',
    serviceHref: '/services/seo',
  },
  {
    id: 'website-care',
    slug: 'website-care-maintenance',
    name: 'Website Care & Maintenance',
    shortName: 'Website Care',
    category: 'website-care',
    accent: 'gold',
    billing: 'monthly',
    startingPriceCad: 199,
    priceLabel: 'CAD $199',
    priceSuffix: '/month',
    timeline: 'Ongoing monthly plan',
    summary:
      'Proactive WordPress care—updates, backups, security, uptime, and priority support—so your site stays fast, secure, and online.',
    disclosures: [
      'Monthly plan. Cancel anytime according to the published cancellation policy.',
      'Hosting fees are separate unless otherwise agreed in writing.',
    ],
    includes: [
      'WordPress core, theme, and plugin updates',
      'Daily backups',
      'Security monitoring',
      'Malware scanning and removal',
      'Uptime monitoring',
      'Bug fixes',
      'Performance checks',
      'Technical support',
      'Priority issue resolution',
    ],
    href: '/pricing#website-care',
    serviceHref: '/services/website-care',
  },
] as const satisfies ServicePackage[];

export const packageById = Object.fromEntries(
  packages.map((pkg) => [pkg.id, pkg]),
) as Record<string, ServicePackage>;

export const ALLOWED_PLAN_IDS = packages.map((pkg) => pkg.id);

export function getPackageById(id: string): ServicePackage | undefined {
  return packageById[id];
}

/** Contact form deep-link for requesting a quote on a package. */
export function quoteContactHref(planId: string): string {
  return `/contact?plan=${encodeURIComponent(planId)}&intent=quote`;
}

export function formatCad(amount: number): string {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function isValidPlanId(id: unknown): id is string {
  return typeof id === 'string' && ALLOWED_PLAN_IDS.includes(id);
}

/**
 * Single source of truth for service packages.
 * Pricing cards, comparison tables, structured data, and AI chat all read from here.
 */

export type BillingType = 'one_time' | 'monthly';
export type PackageCategory = 'branding' | 'web-design' | 'seo' | 'website-care';
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
    id: 'brand-identity',
    slug: 'brand-identity-logo-design',
    name: 'Brand Identity & Logo Design',
    shortName: 'Brand Identity',
    category: 'branding',
    accent: 'blue',
    billing: 'one_time',
    startingPriceCad: 1499,
    priceLabel: 'CAD $1,499',
    timeline: '1–2 weeks',
    summary:
      'A practical brand identity system that gives your business a consistent, professional look across your website, social channels, and marketing materials.',
    disclosures: [
      'Starting price. Final scope is confirmed after a short discovery conversation.',
      'Timeline assumes timely client content, access and feedback.',
      'Simple project payments: 50% to begin. The remaining 50% is due after final approval and before final-file delivery.',
      'Does not include trademark clearance or legal availability checks.',
    ],
    includes: [
      'Brand discovery and creative direction',
      'Primary logo',
      'Secondary logo variation',
      'Brand mark/icon',
      'Colour palette',
      'Typography system',
      'Visual direction',
      'Two initial creative concepts',
      'Up to two revision rounds',
      'Mini brand guidelines',
      'Social/profile assets',
      'Final web and print-ready files',
    ],
    href: '/pricing#brand-identity',
    serviceHref: '/services/branding',
  },
  {
    id: 'custom-website',
    slug: 'custom-website',
    name: 'Custom Website — Built From Scratch',
    shortName: 'Custom Website',
    category: 'web-design',
    accent: 'purple',
    billing: 'one_time',
    startingPriceCad: 4999,
    priceLabel: 'CAD $4,999',
    timeline: '3–5 weeks',
    summary:
      'A fast, conversion-focused website designed and developed specifically for your business—without relying on an off-the-shelf commercial theme.',
    disclosures: [
      'Starting price. Complex features, content production, or integrations may change the final quote.',
      'Timeline assumes timely client content, access and feedback.',
      'Simple project payments: 50% to begin. The remaining 50% is due after final approval and before launch.',
      'Domain, DNS and SSL launch setup included. Domain registration and renewal fees are paid separately by the client.',
    ],
    includes: [
      'Discovery and strategy session',
      'Custom UI/UX design',
      'Built from scratch without a commercial theme',
      'Responsive development',
      'Conversion-focused layouts',
      'Performance optimization',
      'SEO-ready architecture',
      'Accessible implementation',
      'Contact forms',
      'Content editing capability where included in scope',
      'Analytics integration',
      'Domain, DNS and SSL launch setup',
      'Training or handoff where applicable',
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
    timeline: '4–6 weeks',
    summary:
      'Everything in Custom Website — Built From Scratch, plus a complete SEO launch foundation so your new site is ready to get found from day one.',
    disclosures: [
      'Starting price. SEO scope assumes a standard local or service-business footprint; broader markets are quoted separately.',
      'Timeline assumes timely client content, access and feedback.',
      'Simple project payments: 50% to begin. The remaining 50% is due after final approval and before launch.',
      'SEO can improve visibility over time, but specific rankings, traffic, leads, revenue, or conversion results are not guaranteed.',
      'Domain, DNS and SSL launch setup included. Domain registration and renewal fees are paid separately by the client.',
    ],
    includes: [
      'Everything in Custom Website — Built From Scratch',
      'Keyword research',
      'Search-intent mapping',
      'Technical SEO implementation',
      'On-page SEO',
      'Title and meta optimization',
      'Schema / structured data where appropriate',
      'Internal-linking strategy',
      'Image optimization',
      'Sitemap and robots validation',
      'Google Search Console setup',
      'Local SEO where relevant',
      'Google Business Profile optimization where relevant',
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
      'Results depend on competition, content, and technical health; rankings, traffic, leads, revenue, or conversion results are not guaranteed.',
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
      'Proactive website care covering monitoring, maintenance, security, performance and priority technical support so your website stays reliable after launch.',
    disclosures: [
      'Monthly plan. Cancel anytime according to the published cancellation policy.',
      'Hosting fees are separate unless otherwise agreed in writing.',
    ],
    includes: [
      'Deployment monitoring',
      'Uptime monitoring',
      'Security monitoring',
      'Dependency and security updates where applicable',
      'Bug fixes within plan scope',
      'Performance checks',
      'Form and function testing',
      'Backup/recovery support where applicable',
      'Technical support',
      'Priority issue resolution',
    ],
    href: '/pricing#website-care',
    serviceHref: '/services/website-care',
  },
] as const satisfies ServicePackage[];

export const packageById = Object.fromEntries(packages.map((pkg) => [pkg.id, pkg])) as Record<
  string,
  ServicePackage
>;

export const ALLOWED_PLAN_IDS = packages.map((pkg) => pkg.id);

/**
 * Legacy inbound plan IDs (bookmarks, old CTAs, email links).
 * Mapped to the closest current package so quote deep-links keep working.
 */
export const LEGACY_PLAN_ALIASES: Record<string, string> = {
  'premium-theme': 'custom-website',
  'premium-theme-website': 'custom-website',
};

export function resolvePlanId(id: string | null | undefined): string | undefined {
  if (!id) return undefined;
  if (isValidPlanId(id)) return id;
  const aliased = LEGACY_PLAN_ALIASES[id];
  return aliased && isValidPlanId(aliased) ? aliased : undefined;
}

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

export function categoryLabel(category: PackageCategory): string {
  switch (category) {
    case 'branding':
      return 'Branding';
    case 'web-design':
      return 'Web Design';
    case 'seo':
      return 'SEO';
    case 'website-care':
      return 'Website Care';
  }
}

/**
 * Owner-editable site configuration.
 * Fill verified contact, address, and social values before launch.
 * Unknown values must remain undefined so they are omitted from markup and schema.
 */

import type { FooterLink, NavItem } from '../lib/navigation';

export type SiteProject = {
  id: string;
  title: string;
  summary: string;
  industry?: string;
  /** Lead-gen / education goal for this portfolio concept. */
  websiteGoal?: string;
  /** Studio role / scope for the concept build. */
  role?: string;
  /** Implementation stack called out for this concept. */
  technologies?: string[];
  services: string[];
  /** Live demo or case-study URL (external subdomain or internal path). */
  href?: string;
  /** Button label for href — defaults to “View live demo” for http(s) links. */
  hrefLabel?: string;
  imageSrc?: string;
  imageAlt?: string;
  /** Only include metrics that are verified and approved for publication. */
  results?: Array<{ label: string; value: string }>;
};

/**
 * NorthLine HOME SERVICES portfolio concept brief + mockup.
 * Live demo is hosted on a dedicated studio subdomain (not the marketing apex).
 */
export const northlineConcept = {
  id: 'northline-home-services',
  title: 'NorthLine HOME SERVICES',
  industry:
    'Home services — HVAC / home heating & cooling, with related plumbing, electrical, and maintenance.',
  websiteGoal:
    'Lead generation and education — make services clear, guide visitors (especially mobile) into a quote/request flow, and demonstrate conversion-focused design and local SEO.',
  role: 'Build and refine this as a portfolio website concept (Che Xu Studio) — implement the responsive landing experience, request flow, and supporting pages.',
  technologies: [
    'Astro 7',
    'React islands',
    'TypeScript',
    'Tailwind CSS v4',
    'Cloudflare Workers/D1',
    'Zod',
    'Vitest',
    'Playwright',
  ],
  services: ['Web Design', 'SEO Strategy', 'Website Care'],
  /** Recommended demo host: dedicated subdomain keeps the studio site clean and SEO-safe. */
  href: 'https://northline-demo.chexustudio.com',
  hrefLabel: 'View live demo',
  imageSrc: '/images/work/northline-home-service-responsive-mockup.png',
  imageAlt:
    'NorthLine HOME SERVICES responsive landing page mockup across tablet, laptop, and phone — navy hero, blue Request Service and golden Get Instant Quote CTAs, and HVAC equipment illustration.',
  summary:
    'Desktop and mobile-responsive HVAC demo focused on conversion and local SEO: clear service paths, quote/request flows, and a multi-device layout that shows how the experience holds from laptop to phone.',
} as const satisfies SiteProject;

/** True when a project link should open in a new tab. */
export function isExternalProjectHref(href: string | undefined): boolean {
  return Boolean(href && /^https?:\/\//i.test(href));
}

export const siteConfig = {
  name: 'Che Xu Studio',
  legalName: 'Che Xu Studio',
  tagline: 'High-Converting Web Design & SEO That Turns Searches Into Customers.',
  supportingMessage: 'Get Found. Win More Customers. Stay Online.',
  locale: 'en-CA',
  currency: 'CAD',
  currencySymbol: '$',

  /**
   * Canonical production URL without trailing slash.
   * Overridden at runtime by PUBLIC_SITE_URL when present.
   */
  defaultSiteUrl: 'https://chexustudio.com',

  /** Verified contact details — set only when confirmed by the business owner. */
  contact: {
    email: 'info@chexustudio.com',
    phone: undefined as string | undefined,
    phoneDisplay: undefined as string | undefined,
    /** Calendly / booking URL for strategy calls — set when ready. */
    bookingUrl: undefined as string | undefined,
  },

  address: {
    streetAddress: undefined as string | undefined,
    addressLocality: undefined as string | undefined,
    addressRegion: undefined as string | undefined,
    postalCode: undefined as string | undefined,
    addressCountry: 'CA',
  },

  social: {
    linkedin: undefined as string | undefined,
    instagram: undefined as string | undefined,
    facebook: undefined as string | undefined,
    x: undefined as string | undefined,
  },

  /** When true, robots meta and sitemap allow indexing. Keep false until launch. */
  allowIndexing: false,

  /**
   * Primary header navigation.
   * Services uses a disclosure submenu (no thin /services overview page).
   * Mobile nav flattens children so every page is visible without an extra tap.
   */
  navigation: [
    { label: 'Home', href: '/' },
    {
      label: 'Services',
      children: [
        { label: 'Web Design', href: '/services/web-design' },
        { label: 'SEO Strategy', href: '/services/seo' },
        { label: 'Website Care', href: '/services/website-care' },
      ],
    },
    { label: 'Pricing', href: '/pricing' },
    { label: 'Work', href: '/work' },
    { label: 'About', href: '/about' },
    { label: 'Contact', href: '/contact' },
  ] as const satisfies readonly NavItem[],

  footer: {
    services: [
      { label: 'Web Design', href: '/services/web-design' },
      { label: 'SEO Strategy', href: '/services/seo' },
      { label: 'Website Care', href: '/services/website-care' },
      { label: 'Pricing', href: '/pricing' },
    ] as const satisfies readonly FooterLink[],
    studio: [
      { label: 'Work', href: '/work' },
      { label: 'About', href: '/about' },
      { label: 'Contact', href: '/contact' },
    ] as const satisfies readonly FooterLink[],
    legal: [
      { label: 'Privacy', href: '/privacy' },
      { label: 'Terms', href: '/terms' },
      { label: 'Refund & Cancellation Policy', href: '/refund-cancellation-policy' },
    ] as const satisfies readonly FooterLink[],
  },

  cta: {
    primary: { label: 'Find My Best Package', href: '/#package-finder' },
    secondary: { label: 'Book a Free Strategy Call', href: '/contact' },
    exploreServices: { label: 'Explore Services', href: '/services/web-design' },
  },

  trustStrip: 'Web Design · SEO Strategy · Website Care',

  /**
   * Portfolio concepts and verified case studies.
   * Leave empty to hide the Work gallery and show the transparent inclusions section instead.
   * Do not invent client metrics — only include results that are verified and approved.
   */
  projects: [northlineConcept] as SiteProject[],

  /** Verified testimonials only. Leave empty to omit the section. */
  testimonials: [] as Array<{
    id: string;
    quote: string;
    name: string;
    role?: string;
    company?: string;
  }>,
} as const;

export type SiteConfig = typeof siteConfig;

export function getSiteUrl(envUrl?: string | null): string {
  const raw = (envUrl || siteConfig.defaultSiteUrl).replace(/\/$/, '');
  return raw;
}

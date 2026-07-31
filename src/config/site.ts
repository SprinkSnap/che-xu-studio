/**
 * Owner-editable site configuration.
 * Fill verified contact, address, and social values before launch.
 * Unknown values must remain undefined so they are omitted from markup and schema.
 */

import type { FooterLink, NavItem } from '../lib/navigation';

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
   * Verified portfolio / case studies only.
   * Leave empty to hide the Work gallery and show the transparent inclusions section instead.
   */
  projects: [] as Array<{
    id: string;
    title: string;
    summary: string;
    industry?: string;
    services: string[];
    href?: string;
    imageSrc?: string;
    imageAlt?: string;
    /** Only include metrics that are verified and approved for publication. */
    results?: Array<{ label: string; value: string }>;
  }>,

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

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
  /** Short client-industry label (e.g. Home Services). */
  industry?: string;
  /** Longer industry / client context under the industry label. */
  industryDetail?: string;
  /** Project goal for this portfolio concept. */
  websiteGoal?: string;
  /** Studio role / scope for the concept build (single paragraph). */
  role?: string;
  /** discrete responsibilities when a role list is preferred. */
  roles?: string[];
  /** Implementation stack called out for this concept. */
  technologies?: string[];
  /** Conversion strategy narrative for the concept. */
  conversionFocus?: string;
  /** SEO implementation narrative for the concept. */
  seoImplementation?: string;
  /** Honest framing note (e.g. portfolio concept / fictional demo). */
  note?: string;
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
 * Framed as a demonstration / portfolio concept — not a live client engagement.
 */
export const northlineConcept = {
  id: 'northline-home-services',
  title: 'NorthLine HOME SERVICES',
  summary:
    'Desktop view, mobile-responsive conversion & SEO — a multi-device home-services experience built to turn visitors into qualified leads.',
  industry: 'Home Services',
  industryDetail:
    'A residential home services business providing reliable solutions for homeowners, with a focus on making it easy to request services and connect with the company.',
  websiteGoal:
    'Design and develop a modern, conversion-focused website that builds trust, improves user experience, supports local SEO, and encourages visitors to become qualified leads through clear calls to action and a mobile-first experience.',
  roles: [
    'UX Research & Strategy',
    'Information Architecture',
    'UI/Visual Design',
    'Responsive Web Design',
    'WordPress Development',
    'Technical SEO Implementation',
    'Performance Optimization',
    'Accessibility Best Practices',
  ],
  technologies: [
    'WordPress',
    'PHP',
    'HTML5',
    'CSS3',
    'JavaScript',
    'Responsive Design',
    'Technical SEO',
    'Performance Optimization',
    'Accessibility (WCAG)',
    'Google Fonts',
    'SVG Icons',
  ],
  conversionFocus:
    'Conversion work focused on clear service messaging, trust-building content, prominent calls to action, streamlined contact and quote request flows, and a mobile-first user experience designed to convert visitors into qualified leads.',
  seoImplementation:
    'SEO implementation included technical SEO best practices, semantic HTML, local SEO foundations, responsive performance optimization, accessible markup, optimized assets, and a search-friendly site architecture that improves discoverability and user experience.',
  note: 'Fictional demonstration / portfolio concept — not a real client engagement. Presented to showcase conversion-focused home-services design, mobile UX, and local SEO approach.',
  services: ['Web Design', 'SEO Strategy', 'Website Care'],
  /** Recommended demo host: dedicated subdomain keeps the studio site clean and SEO-safe. */
  href: 'https://northline-demo.chexustudio.com',
  hrefLabel: 'View live demo',
  imageSrc: '/images/work/northline-home-service-responsive-mockup.png',
  imageAlt:
    'NorthLine HOME SERVICES responsive landing page mockup across tablet, laptop, and phone — navy hero, blue Request Service and golden Get Instant Quote CTAs, and HVAC equipment illustration.',
} as const satisfies SiteProject;

/**
 * Seasonal restaurant / hospitality portfolio concept.
 * Framed as a demonstration / portfolio concept — not a live client engagement.
 */
export const hospitalityConcept = {
  id: 'seasonal-restaurant-concept',
  title: 'Tablekind Kitchen',
  summary:
    'Desktop view, mobile-responsive conversion & SEO — a multi-device restaurant experience built for reservations, ordering, and catering enquiries.',
  industry: 'Hospitality & Food Service',
  industryDetail:
    'A seasonal, community-focused restaurant concept offering dining, reservations, online ordering, and catering experiences designed to bring people together.',
  websiteGoal:
    'Design and develop a modern, conversion-focused restaurant website that builds trust, communicates the brand and menu clearly, improves the customer experience, supports SEO, and encourages visitors to book a table, place an order, or submit a catering enquiry through clear calls to action and a mobile-first experience.',
  roles: [
    'UX Research & Strategy',
    'Information Architecture',
    'UI/Visual Design',
    'Responsive Web Design',
    'Full-Stack Development',
    'Interactive Reservation & Ordering Experiences',
    'Technical SEO Implementation',
    'Performance Optimization',
    'Accessibility Best Practices',
    'Cloudflare Deployment & Security',
  ],
  technologies: [
    'Astro',
    'React',
    'TypeScript',
    'Tailwind CSS v4',
    'Cloudflare Workers',
    'Cloudflare D1',
    'Cloudflare Turnstile',
    'Workers AI',
    'Vitest',
    'Playwright',
    'Responsive Design',
    'Technical SEO',
    'Performance Optimization',
    'Accessibility',
  ],
  note: 'Fictional demonstration / portfolio concept — not a real client engagement. Presented to demonstrate conversion-focused restaurant design, mobile UX, reservations and ordering flows, catering lead generation, and SEO strategy.',
  services: ['Web Design', 'SEO Strategy', 'Website Care'],
} as const satisfies SiteProject;

/**
 * Additional home-services WordPress portfolio concept (after Tablekind Kitchen).
 * Framed as a demonstration / portfolio concept — not a live client engagement.
 */
export const residentialHomeServicesConcept = {
  id: 'residential-home-services-concept',
  title: 'Residential Home Services',
  summary:
    'Desktop view, mobile-responsive conversion & SEO — a multi-device home-services experience built to turn visitors into qualified leads.',
  industry: 'Home Services',
  industryDetail:
    'A residential home services business providing reliable solutions for homeowners, with a focus on making it easy to request services and connect with the company.',
  websiteGoal:
    'Design and develop a modern, conversion-focused website that builds trust, improves user experience, supports local SEO, and encourages visitors to become qualified leads through clear calls to action and a mobile-first experience.',
  roles: [
    'UX Research & Strategy',
    'Information Architecture',
    'UI/Visual Design',
    'Responsive Web Design',
    'WordPress Development',
    'Technical SEO Implementation',
    'Performance Optimization',
    'Accessibility Best Practices',
  ],
  technologies: [
    'WordPress',
    'PHP',
    'HTML5',
    'CSS3',
    'JavaScript',
    'Responsive Design',
    'Technical SEO',
    'Performance Optimization',
    'Accessibility (WCAG)',
    'Google Fonts',
    'SVG Icons',
  ],
  conversionFocus:
    'Conversion work focused on clear service messaging, trust-building content, prominent calls to action, streamlined contact and quote request flows, and a mobile-first user experience designed to convert visitors into qualified leads.',
  seoImplementation:
    'SEO implementation included technical SEO best practices, semantic HTML, local SEO foundations, responsive performance optimization, accessible markup, optimized assets, and a search-friendly site architecture that improves discoverability and user experience.',
  note: 'Fictional demonstration / portfolio concept — not a real client engagement. Presented to showcase conversion-focused home-services design, mobile UX, and local SEO approach.',
  services: ['Web Design', 'SEO Strategy', 'Website Care'],
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
  projects: [northlineConcept, hospitalityConcept, residentialHomeServicesConcept] as SiteProject[],

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

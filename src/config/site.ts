/**
 * Owner-editable site configuration.
 * Fill verified contact, address, and social values before launch.
 * Unknown values must remain undefined so they are omitted from markup and schema.
 */

import type { FooterLink, NavItem } from '../lib/navigation';

export type ProjectKind = 'concept' | 'client';

export type SiteProject = {
  id: string;
  /** URL slug under /work/[slug]. */
  slug: string;
  title: string;
  summary: string;
  /** Distinguishes portfolio concepts from verified client work. */
  projectKind: ProjectKind;
  /** Show on the homepage featured work strip (keep to ~3). */
  featured?: boolean;
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

/** Concise, non-apologetic disclosure for portfolio concept projects. */
export const CONCEPT_DISCLOSURE =
  'Concept project — created to demonstrate Che Xu Studio’s approach to conversion-focused design and SEO.';

export function projectPath(project: Pick<SiteProject, 'slug'>): string {
  return `/work/${project.slug}`;
}

/**
 * NorthLine HOME SERVICES portfolio concept brief + mockup.
 * Live demo is hosted on a dedicated studio subdomain (not the marketing apex).
 * Framed as a demonstration / portfolio concept — not a live client engagement.
 */
export const northlineConcept = {
  id: 'northline-home-services',
  slug: 'northline-home-services',
  title: 'NorthLine HOME SERVICES',
  summary:
    'A mobile-first home-services site designed to turn visitors into qualified leads with clear service messaging and quote CTAs.',
  projectKind: 'concept',
  featured: true,
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
  note: CONCEPT_DISCLOSURE,
  services: ['Web Design', 'SEO Strategy', 'Website Care'],
  /** Recommended demo host: dedicated subdomain keeps the studio site clean and SEO-safe. */
  href: 'https://northline-demo.chexustudio.com',
  hrefLabel: 'View live demo',
  imageSrc: '/images/work/northline-home-service-responsive-mockup.png',
  imageAlt:
    'NorthLine HOME SERVICES responsive landing page mockup across tablet, laptop, and phone — dusk house hero, Trusted Professionals trust row, blue Request Service and gold Explore Services CTAs.',
} as const satisfies SiteProject;

/**
 * Seasonal restaurant / hospitality portfolio concept.
 * Framed as a demonstration / portfolio concept — not a live client engagement.
 */
export const hospitalityConcept = {
  id: 'seasonal-restaurant-concept',
  slug: 'tablekind-kitchen',
  title: 'Tablekind Kitchen',
  summary:
    'A restaurant website built for reservations, ordering, and catering enquiries—with mobile-first conversion paths.',
  projectKind: 'concept',
  featured: true,
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
  note: `${CONCEPT_DISCLOSURE} Focus areas: reservations, ordering, and catering lead generation.`,
  services: ['Web Design', 'SEO Strategy', 'Website Care'],
  href: 'https://tablekindkitchen.chexustudio.com/',
  hrefLabel: 'View live demo',
  imageSrc: '/images/work/tablekind-kitchen-restaurant-website-design-responsive-mockup-1.png',
  imageAlt:
    'Tablekind Kitchen responsive restaurant website mockup across tablet, laptop, and phone — seasonal food hero, Reserve a Table and Explore the Menu CTAs, and plated dish photography.',
} as const satisfies SiteProject;

/**
 * Harbour & Pine Home — fictional Canadian home décor e-commerce storefront demo.
 * Demo only: no real orders or payments; portfolio enquiry focused.
 */
export const residentialHomeServicesConcept = {
  id: 'residential-home-services-concept',
  slug: 'harbour-pine-home',
  title: 'Harbour & Pine Home',
  summary:
    'A home décor storefront demo focused on product discovery, cart flows, and clear enquiry pathways.',
  projectKind: 'concept',
  industry: 'Home Décor & Lifestyle E-commerce',
  industryDetail:
    'Fictional Canadian home décor and lifestyle e-commerce, selling curated furniture, accessories, collections, and bundles.',
  websiteGoal:
    'Create a polished storefront demonstration that showcases product discovery, filtering, wishlists, cart and checkout flows, while generating genuine portfolio enquiries for Che Xu Studio. It is a demo rather than a live merchant site, so it does not accept real orders or payments.',
  role: 'End-to-end website design and development, including the storefront experience, responsive interface, product architecture, interactive shopping features, accessibility testing, deployment setup, security controls, and lead-generation flow.',
  technologies: [
    'Astro 7',
    'React 19',
    'TypeScript',
    'Tailwind CSS 4',
    'Cloudflare Workers',
    'Cloudflare D1',
    'Wrangler',
    'Zod',
    'Turnstile',
    'Vitest',
    'Playwright',
    'ESLint',
    'Prettier',
  ],
  conversionFocus:
    'Conversion work focused on intuitive product navigation, collections, bundles, filters, wishlists, cart interactions, a demo checkout, and prominent enquiry pathways. Lead forms are protected with Turnstile, origin validation, and rate limiting.',
  seoImplementation:
    'SEO foundations include canonical-site configuration, semantic page structure, optimized image dimensions and loading, reusable SEO utilities, and support for accurate structured data. Because the current storefront is fictional, it deliberately uses noindex, nofollow and suppresses fabricated Product and Offer schema until real merchant, inventory, policy, and checkout data are verified.',
  note: `${CONCEPT_DISCLOSURE} Demo storefront only; does not accept real orders or payments.`,
  services: ['Web Design', 'SEO Strategy', 'Website Care'],
  href: 'https://harbourandpinehome.chexustudio.com/',
  hrefLabel: 'View live demo',
  imageSrc: '/images/work/harbour-pine-home-responsive-ecommerce-website-mockup.png',
  imageAlt:
    'Harbour & Pine Home responsive e-commerce mockup across tablet, laptop, and phone — calm home décor hero, Shop the Collection CTA, and lifestyle living-room photography.',
} as const satisfies SiteProject;

/**
 * Interior design / home-improvement portfolio concept (after Harbour & Pine Home).
 */
export const interiorDesignConcept = {
  id: 'interior-design-home-improvement-concept',
  slug: 'form-field-interiors',
  title: 'Form & Field Interiors',
  summary:
    'An interior-design site built to present services, showcase work, and generate qualified inquiries.',
  projectKind: 'concept',
  featured: true,
  industry: 'Interior Design & Home Improvement',
  industryDetail:
    'Interior design and home-improvement services, focused on creating functional and visually appealing residential or commercial spaces.',
  websiteGoal:
    'To present the company’s interior-design services and past work, build trust with potential clients, and generate qualified inquiries through clear calls to action and accessible contact forms.',
  role: 'I designed and developed the website’s front-end experience, including the page structure, responsive interface, service presentation, lead-generation forms, and conversion-focused user journey.',
  technologies: [
    'HTML',
    'CSS',
    'JavaScript',
    'Responsive Design',
    'Reusable Web Components',
    'Framework-Based Components',
  ],
  conversionFocus:
    'I structured the site around clear service messaging, prominent inquiry actions, streamlined forms, mobile responsiveness, semantic page hierarchy, descriptive metadata, and search-friendly content. These decisions were intended to reduce friction, improve discoverability, and turn more visitors into prospective clients.',
  note: CONCEPT_DISCLOSURE,
  services: ['Web Design', 'SEO Strategy', 'Website Care'],
  href: 'https://formandfieldinteriors.chexustudio.com/',
  hrefLabel: 'View live demo',
  imageSrc: '/images/work/form-and-field-interiors-responsive-website-mockup.webp',
  imageAlt:
    'Form & Field Interiors responsive website mockup across laptop, tablet, and phone — interior-design hero, project showcase, and inquiry-focused layout.',
} as const satisfies SiteProject;

/**
 * SignalFlow CRM — fictional B2B SaaS / CRM marketing site + interactive product demo.
 * Portfolio concept with deliberate noindex until a real production launch.
 */
export const signalFlowCrmConcept = {
  id: 'signalflow-crm-concept',
  slug: 'signalflow-crm',
  title: 'SignalFlow CRM',
  summary:
    'A B2B SaaS marketing site that explains the product, presents pricing, and offers an interactive CRM demo.',
  projectKind: 'concept',
  industry: 'B2B SaaS / CRM Software',
  industryDetail:
    'SignalFlow CRM is a fictional CRM product created as a realistic portfolio demonstration.',
  websiteGoal:
    'Create a polished SaaS marketing experience that explains the CRM, presents features and pricing, and lets potential customers experience the product through an interactive browser-based demo.',
  role: 'End-to-end website and product experience design/development, covering the marketing site, interactive CRM demo, lead-generation flow, responsive UI, accessibility, testing, and Cloudflare deployment architecture.',
  technologies: [
    'Astro 7',
    'React 19',
    'TypeScript',
    'Tailwind CSS',
    'Cloudflare Workers',
    'D1',
    'Turnstile',
    'Workers AI',
    'Zod',
    'Vitest',
    'Playwright',
    'Axe accessibility testing',
  ],
  conversionFocus:
    'The experience is designed around conversion through clear product positioning, pricing, an interactive CRM demo, plan recommendations, and a protected enquiry/lead-capture flow.',
  seoImplementation:
    'SEO foundations include static generation, canonical-site configuration, sitemap support and robots controls. Because this is currently a fictional portfolio demo, indexing is deliberately disabled with noindex/nofollow; those controls can be switched for a real production launch.',
  note: CONCEPT_DISCLOSURE,
  services: ['Web Design', 'SEO Strategy', 'Website Care'],
  href: 'https://signalflowcrm.chexustudio.com/',
  hrefLabel: 'View live demo',
  imageSrc: '/images/work/signalflow-crm-saas-website-responsive-mockup.png',
  imageAlt:
    'SignalFlow CRM responsive SaaS website mockup across tablet, laptop, and phone — lead pipeline hero, Explore the Live Demo CTA, and workspace metrics interface.',
} as const satisfies SiteProject;

/**
 * LocalPro Directory — fictional local-services directory and quote-request platform.
 * Portfolio concept with deliberate noindex until a real production launch.
 */
export const localProDirectoryConcept = {
  id: 'localpro-directory-concept',
  slug: 'localpro-directory',
  title: 'LocalPro Directory',
  summary:
    'A local-services directory built for provider discovery, comparison, and quote requests.',
  projectKind: 'concept',
  industry: 'Local Services & Professional Directory Marketplace',
  industryDetail:
    'LocalPro Directory is a fictional local-services and professional directory marketplace created as a realistic portfolio demonstration.',
  websiteGoal:
    'Help users discover, compare, save, and request quotes from local service providers while demonstrating a production-ready directory platform.',
  role: 'Full-stack developer and UX designer, responsible for the platform architecture, responsive interface, search experience, conversion flows, data layer, testing, security, and deployment.',
  technologies: [
    'Astro 5',
    'React 19',
    'TypeScript',
    'Tailwind CSS',
    'Cloudflare Workers',
    'Cloudflare D1',
    'Zod',
    'Vitest',
    'Playwright',
    'Wrangler',
    'Optional Workers AI',
  ],
  conversionFocus:
    'Conversion work focused on clear provider discovery, filtering and comparison tools, quote-request journeys, business onboarding, labelled featured placements, and protected studio-enquiry forms.',
  seoImplementation:
    'SEO foundations include prerendered category, service-area, and provider pages; sitemap support; canonical configuration; optimized assets; and an SEO-ready page architecture. Because this is a fictional portfolio demo, it intentionally uses noindex, nofollow and avoids misleading business schema until real, verified listings are added.',
  note: CONCEPT_DISCLOSURE,
  services: ['Web Design', 'SEO Strategy', 'Website Care'],
  href: 'https://localprodirectory.chexustudio.com/',
  hrefLabel: 'View live demo',
  imageSrc: '/images/work/localpro-directory-responsive-local-services-website-mockup.webp',
  imageAlt:
    'LocalPro Directory responsive local-services website mockup across laptop, tablet, and phone — provider discovery hero, search and compare tools, and quote-request focused layout.',
} as const satisfies SiteProject;

/** True when a project link should open in a new tab. */
export function isExternalProjectHref(href: string | undefined): boolean {
  return Boolean(href && /^https?:\/\//i.test(href));
}

export const siteConfig = {
  name: 'Che Xu Studio',
  legalName: 'Che Xu Studio',
  tagline: 'Conversion-Focused Web Design & SEO for Canadian Small Businesses.',
  supportingMessage:
    'Clear pricing. Direct communication. Websites built to win qualified enquiries.',
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
        { label: 'Branding', href: '/services/branding' },
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
    /** Conversion band shown above footer navigation on every page. */
    cta: {
      eyebrow: 'Ready when you are',
      headline: 'Start your next website project with clear scope and pricing.',
      body: 'Request a project quote if you know what you need—or use the package finder for a guided recommendation.',
    },
    /** One-line summaries under column headings for topical relevance. */
    columnDescriptions: {
      services: 'Branding, web design, SEO, and website care for Canadian small businesses.',
      studio: 'Portfolio work, studio background, and direct contact.',
      legal: 'Privacy, terms, and refund policies.',
    },
    services: [
      {
        label: 'Branding',
        href: '/services/branding',
        description: 'Brand identity and visual systems for small businesses.',
      },
      {
        label: 'Web Design',
        href: '/services/web-design',
        description: 'Conversion-focused website design and development.',
      },
      {
        label: 'SEO Strategy',
        href: '/services/seo',
        description: 'Technical and local SEO to improve qualified discovery.',
      },
      {
        label: 'Website Care',
        href: '/services/website-care',
        description: 'Ongoing updates, monitoring, and performance support.',
      },
      {
        label: 'Pricing',
        href: '/pricing',
        description: 'Transparent CAD starting prices for every service package.',
      },
    ] as const satisfies readonly FooterLink[],
    studio: [
      { label: 'Work', href: '/work', description: 'Portfolio concepts and case studies.' },
      { label: 'About', href: '/about', description: 'How Che Xu Studio works with clients.' },
      {
        label: 'Contact',
        href: '/contact',
        description: 'Request a quote or ask a project question.',
      },
    ] as const satisfies readonly FooterLink[],
    legal: [
      { label: 'Privacy', href: '/privacy', description: 'How we collect and use information.' },
      { label: 'Terms', href: '/terms', description: 'Terms of service for studio engagements.' },
      {
        label: 'Refund & Cancellation Policy',
        href: '/refund-cancellation-policy',
        description: 'Refund and cancellation terms for projects and care plans.',
      },
    ] as const satisfies readonly FooterLink[],
  },

  cta: {
    /** High-intent enquiry path — primary across header, sticky bar, and final CTA. */
    primary: { label: 'Get a Project Quote', href: '/contact?intent=quote' },
    /** Lower-intent guided path for visitors who are still choosing. */
    secondary: { label: 'Find My Best Package', href: '/#package-finder' },
    exploreServices: { label: 'Explore Web Design', href: '/services/web-design' },
  },

  trustStrip:
    'Work directly with your designer-developer · Transparent CAD starting prices · Scope confirmed before invoicing',

  /**
   * Portfolio concepts and verified case studies.
   * Leave empty to hide the Work gallery and show the transparent inclusions section instead.
   * Do not invent client metrics — only include results that are verified and approved.
   */
  projects: [
    northlineConcept,
    hospitalityConcept,
    residentialHomeServicesConcept,
    interiorDesignConcept,
    signalFlowCrmConcept,
    localProDirectoryConcept,
  ] as SiteProject[],

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

export function getProjectBySlug(slug: string): SiteProject | undefined {
  return siteConfig.projects.find((project) => project.slug === slug);
}

export function featuredProjects(limit = 3): SiteProject[] {
  const featured = siteConfig.projects.filter((project) => project.featured);
  if (featured.length > 0) return featured.slice(0, limit);
  return siteConfig.projects.slice(0, limit);
}

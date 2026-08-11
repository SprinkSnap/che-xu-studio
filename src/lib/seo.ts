import { siteConfig, getSiteUrl } from '../config/site';
import { packages } from '../config/packages';
import type { FaqItem } from '../config/faq';
import { flattenNavDestinations } from './navigation';

export interface PageSeo {
  title: string;
  description: string;
  path: string;
  ogImage?: string;
  noindex?: boolean;
}

export function absoluteUrl(path: string, siteUrl?: string): string {
  const base = getSiteUrl(siteUrl || import.meta.env.PUBLIC_SITE_URL);
  if (!path || path === '/') return base;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

export function titleTemplate(pageTitle: string): string {
  if (pageTitle.includes(siteConfig.name)) return pageTitle;
  return `${pageTitle} | ${siteConfig.name}`;
}

export function organizationSchema(siteUrl?: string) {
  const url = getSiteUrl(siteUrl || import.meta.env.PUBLIC_SITE_URL);
  const org: Record<string, unknown> = {
    '@type': 'ProfessionalService',
    '@id': `${url}/#organization`,
    name: siteConfig.name,
    url,
    description: siteConfig.tagline,
    areaServed: 'CA',
    knowsAbout: ['Web Design', 'SEO', 'Website Maintenance', 'WordPress'],
  };

  if (siteConfig.contact.email) org.email = siteConfig.contact.email;
  if (siteConfig.contact.phone) org.telephone = siteConfig.contact.phone;

  const addressParts = siteConfig.address;
  if (addressParts.addressLocality || addressParts.streetAddress) {
    org.address = {
      '@type': 'PostalAddress',
      streetAddress: addressParts.streetAddress,
      addressLocality: addressParts.addressLocality,
      addressRegion: addressParts.addressRegion,
      postalCode: addressParts.postalCode,
      addressCountry: addressParts.addressCountry,
    };
  }

  const sameAs = Object.values(siteConfig.social).filter(Boolean);
  if (sameAs.length) org.sameAs = sameAs;

  return org;
}

export function websiteSchema(siteUrl?: string) {
  const url = getSiteUrl(siteUrl || import.meta.env.PUBLIC_SITE_URL);
  return {
    '@type': 'WebSite',
    '@id': `${url}/#website`,
    url,
    name: siteConfig.name,
    description: siteConfig.tagline,
    inLanguage: siteConfig.locale,
    publisher: { '@id': `${url}/#organization` },
  };
}

/** Primary destinations for SiteNavigationElement (matches header / mobile nav). */
export function siteNavigationSchema(siteUrl?: string) {
  const url = getSiteUrl(siteUrl || import.meta.env.PUBLIC_SITE_URL);
  const destinations = flattenNavDestinations(siteConfig.navigation);
  return {
    '@type': 'SiteNavigationElement',
    '@id': `${url}/#site-navigation`,
    name: 'Primary',
    hasPart: destinations.map((destination, index) => ({
      '@type': 'WebPage',
      position: index + 1,
      name: destination.label,
      url: absoluteUrl(destination.href, url),
    })),
  };
}

export function offerCatalogSchema(siteUrl?: string) {
  const url = getSiteUrl(siteUrl || import.meta.env.PUBLIC_SITE_URL);
  return {
    '@type': 'OfferCatalog',
    '@id': `${url}/pricing#catalog`,
    name: `${siteConfig.name} Service Packages`,
    itemListElement: packages.map((pkg, index) => ({
      '@type': 'Offer',
      position: index + 1,
      name: pkg.name,
      description: pkg.summary,
      url: absoluteUrl(pkg.href, url),
      priceCurrency: siteConfig.currency,
      price: pkg.startingPriceCad,
      priceSpecification: {
        '@type': 'PriceSpecification',
        priceCurrency: siteConfig.currency,
        price: pkg.startingPriceCad,
        valueAddedTaxIncluded: false,
        description: pkg.billing === 'monthly' ? 'Starting monthly price' : 'Starting project price',
      },
      availability: 'https://schema.org/InStock',
    })),
  };
}

export function serviceSchema(options: {
  name: string;
  description: string;
  path: string;
  siteUrl?: string;
}) {
  const url = getSiteUrl(options.siteUrl || import.meta.env.PUBLIC_SITE_URL);
  return {
    '@type': 'Service',
    name: options.name,
    description: options.description,
    url: absoluteUrl(options.path, url),
    provider: { '@id': `${url}/#organization` },
    areaServed: 'CA',
  };
}

export function breadcrumbSchema(
  items: Array<{ name: string; path: string }>,
  siteUrl?: string,
) {
  const url = getSiteUrl(siteUrl || import.meta.env.PUBLIC_SITE_URL);
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path, url),
    })),
  };
}

export function faqPageSchema(items: FaqItem[]) {
  return {
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };
}

/**
 * Portfolio project page schema.
 * Uses CreativeWork only — never presents fictional concepts as client CaseStudy results.
 */
export function portfolioProjectSchema(options: {
  name: string;
  description: string;
  path: string;
  image?: string;
  projectKind: 'concept' | 'client';
  siteUrl?: string;
}) {
  const url = getSiteUrl(options.siteUrl || import.meta.env.PUBLIC_SITE_URL);
  const schema: Record<string, unknown> = {
    '@type': 'CreativeWork',
    name: options.name,
    description: options.description,
    url: absoluteUrl(options.path, url),
    creator: { '@id': `${url}/#organization` },
    inLanguage: siteConfig.locale,
  };

  if (options.image) schema.image = absoluteUrl(options.image, url);
  if (options.projectKind === 'concept') {
    schema.genre = 'Portfolio concept';
    schema.creativeWorkStatus = 'Portfolio demonstration';
  }

  return schema;
}

export function jsonLd(graph: unknown[]): string {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': graph,
  }).replace(/</g, '\\u003c');
}

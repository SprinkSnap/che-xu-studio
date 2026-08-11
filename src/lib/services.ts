/** Map portfolio service labels to internal service routes. */
export const SERVICE_HREF_BY_LABEL: Record<string, string> = {
  'Web Design': '/services/web-design',
  'SEO Strategy': '/services/seo',
  'Website Care': '/services/website-care',
};

export function serviceHrefForLabel(label: string): string | undefined {
  return SERVICE_HREF_BY_LABEL[label];
}

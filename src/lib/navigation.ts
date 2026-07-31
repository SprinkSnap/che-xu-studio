export type NavChild = { label: string; href: string };
export type NavItem = {
  label: string;
  /** When omitted, the item is a disclosure control (e.g. Services). */
  href?: string;
  children?: readonly NavChild[];
};

export type FooterLink = { label: string; href: string };

export type NavDestination = { label: string; href: string; group?: string };

/** Normalize for trailing-slash / query / hash insensitive comparisons. */
export function normalizePath(pathname: string): string {
  const bare = pathname.split('?')[0]?.split('#')[0] || '/';
  if (bare === '/') return '/';
  return bare.replace(/\/+$/, '') || '/';
}

export function isCurrentPath(pathname: string, href: string): boolean {
  return normalizePath(pathname) === normalizePath(href);
}

export function isNavItemActive(pathname: string, item: NavItem): boolean {
  if (item.href && isCurrentPath(pathname, item.href)) return true;
  return Boolean(
    item.children?.some(
      (child) =>
        isCurrentPath(pathname, child.href) ||
        normalizePath(pathname).startsWith(`${normalizePath(child.href)}/`),
    ),
  );
}

/**
 * Flatten primary nav into crawlable / mobile destinations.
 * Parent items with children contribute their children (and optional parent href).
 */
export function flattenNavDestinations(items: readonly NavItem[]): NavDestination[] {
  const destinations: NavDestination[] = [];

  for (const item of items) {
    if (item.children?.length) {
      if (item.href) {
        destinations.push({ label: item.label, href: item.href, group: item.label });
      }
      for (const child of item.children) {
        destinations.push({ label: child.label, href: child.href, group: item.label });
      }
      continue;
    }
    if (item.href) {
      destinations.push({ label: item.label, href: item.href });
    }
  }

  return destinations;
}

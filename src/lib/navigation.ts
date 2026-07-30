export type NavChild = { label: string; href: string };
export type NavItem = {
  label: string;
  /** When omitted, the item is a disclosure control (e.g. Services). */
  href?: string;
  children?: readonly NavChild[];
};

export type FooterLink = { label: string; href: string };

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

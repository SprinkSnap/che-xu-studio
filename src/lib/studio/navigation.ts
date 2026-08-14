export type StudioNavItem = {
  href: string;
  label: string;
  /** Short label for compact mobile chrome when needed. */
  shortLabel?: string;
};

/** Primary Studio OS destinations (Phase 2 placeholders). */
export const studioNavItems: StudioNavItem[] = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/clients', label: 'Clients' },
  { href: '/admin/projects', label: 'Projects' },
  { href: '/admin/proposals', label: 'Proposals' },
  { href: '/admin/invoices', label: 'Invoices' },
  { href: '/admin/payments', label: 'Payments' },
  { href: '/admin/templates', label: 'Templates' },
  { href: '/admin/settings', label: 'Settings' },
];

/**
 * Whether a nav item should be marked current for the given pathname.
 * Dashboard (`/admin`) is exact-only so nested routes do not highlight it.
 */
export function isStudioNavActive(pathname: string, href: string): boolean {
  const path = normalizeStudioPath(pathname);
  const target = normalizeStudioPath(href);
  if (target === '/admin') return path === '/admin';
  return path === target || path.startsWith(`${target}/`);
}

export function normalizeStudioPath(pathname: string): string {
  if (!pathname) return '/';
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

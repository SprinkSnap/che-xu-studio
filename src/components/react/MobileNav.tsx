import { useEffect, useId, useRef, useState } from 'react';
import { Menu, X } from 'lucide-react';
import {
  flattenNavDestinations,
  isCurrentPath,
  isNavItemActive,
  type NavItem,
} from '../../lib/navigation';

interface Props {
  items: readonly NavItem[];
  primaryCta: { label: string; href: string };
  secondaryCta: { label: string; href: string };
  currentPath: string;
}

type MobileRow =
  | { kind: 'group'; label: string; active: boolean }
  | { kind: 'link'; label: string; href: string; current: boolean };

function buildMobileRows(items: readonly NavItem[], currentPath: string): MobileRow[] {
  const destinations = flattenNavDestinations(items);
  const rows: MobileRow[] = [];
  let lastGroup: string | undefined;

  for (const destination of destinations) {
    if (destination.group && destination.group !== lastGroup) {
      const parent = items.find((item) => item.label === destination.group);
      rows.push({
        kind: 'group',
        label: destination.group,
        active: parent ? isNavItemActive(currentPath, parent) : false,
      });
      lastGroup = destination.group;
    }
    rows.push({
      kind: 'link',
      label: destination.label,
      href: destination.href,
      current: isCurrentPath(currentPath, destination.href),
    });
  }

  return rows;
}

export default function MobileNav({ items, primaryCta, secondaryCta, currentPath }: Props) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const openRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const rows = buildMobileRows(items, currentPath);

  useEffect(() => {
    if (!open) return;

    const dialog = dialogRef.current;
    const focusableSelector =
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        return;
      }
      if (e.key !== 'Tab' || !dialog) return;

      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector)).filter(
        (el) => el.tabIndex !== -1 && !el.hasAttribute('disabled'),
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      openRef.current?.focus();
    };
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        ref={openRef}
        type="button"
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-white/20 text-white"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(true)}
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
        <span className="sr-only">Open menu</span>
      </button>

      {/*
        Keep destinations in the DOM when closed so mobile-first crawlers still see
        every primary page link (visibility toggled, not unmounted).
      */}
      <div
        ref={dialogRef}
        id={panelId}
        className={open ? 'fixed inset-0 z-[60]' : 'hidden'}
        role="dialog"
        aria-modal={open || undefined}
        aria-label="Mobile navigation"
        aria-hidden={open ? undefined : true}
        inert={open ? undefined : true}
      >
        <button
          type="button"
          className="absolute inset-0 bg-navy-950/70"
          aria-label="Close menu overlay"
          tabIndex={open ? 0 : -1}
          onClick={() => setOpen(false)}
        />
        <div className="absolute inset-y-0 right-0 flex w-[min(100%,22rem)] max-w-full flex-col bg-navy-950 pb-[env(safe-area-inset-bottom)] text-white shadow-lift">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <p className="font-display text-lg font-bold">Menu</p>
            <button
              ref={closeRef}
              type="button"
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-white/20"
              tabIndex={open ? 0 : -1}
              onClick={() => setOpen(false)}
            >
              <X className="h-5 w-5" aria-hidden="true" />
              <span className="sr-only">Close menu</span>
            </button>
          </div>
          <nav
            className="flex-1 overflow-y-auto overscroll-contain px-3 py-4"
            aria-label="Mobile primary"
          >
            <ul className="space-y-1">
              {rows.map((row) => {
                if (row.kind === 'group') {
                  return (
                    <li key={`group-${row.label}`} className="list-none">
                      <p
                        className={[
                          'mt-3 px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-[0.14em] first:mt-0',
                          row.active ? 'text-white' : 'text-blue-200/80',
                        ].join(' ')}
                      >
                        {row.label}
                      </p>
                    </li>
                  );
                }

                return (
                  <li key={row.href}>
                    <a
                      href={row.href}
                      className={[
                        'block rounded-md px-3 py-3 text-base font-medium hover:bg-white/10 hover:text-white',
                        row.current ? 'bg-white/15 font-semibold text-white' : 'text-blue-100',
                      ].join(' ')}
                      aria-current={row.current ? 'page' : undefined}
                      tabIndex={open ? 0 : -1}
                      onClick={() => setOpen(false)}
                    >
                      {row.label}
                    </a>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className="space-y-2 border-t border-white/10 p-4">
            <a
              href={primaryCta.href}
              className="btn btn-primary-on-dark w-full"
              tabIndex={open ? 0 : -1}
              data-track="mobile_nav_primary_cta"
              onClick={() => setOpen(false)}
            >
              {primaryCta.label}
            </a>
            <a
              href={secondaryCta.href}
              className="btn-secondary w-full border-white/20 bg-transparent text-white hover:bg-white/10"
              tabIndex={open ? 0 : -1}
              data-track="mobile_nav_secondary_cta"
              onClick={() => setOpen(false)}
            >
              {secondaryCta.label}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

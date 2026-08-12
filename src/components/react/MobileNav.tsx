import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Menu, X } from 'lucide-react';
import {
  flattenNavDestinations,
  isCurrentPath,
  isNavItemActive,
  type NavItem,
} from '../../lib/navigation';

interface Props {
  items: readonly NavItem[];
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

/**
 * Full-viewport mobile menu.
 * Portaled to document.body so header backdrop-filter cannot trap position:fixed
 * (which previously made the panel open over the logo and scroll inside the header).
 */
export default function MobileNav({ items, currentPath }: Props) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const panelId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const openRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const rows = buildMobileRows(items, currentPath);

  useEffect(() => {
    setMounted(true);
  }, []);

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
    document.body.dataset.mobileNavOpen = 'true';
    closeRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      delete document.body.dataset.mobileNavOpen;
      openRef.current?.focus();
    };
  }, [open]);

  const panel = (
    <div
      ref={dialogRef}
      id={panelId}
      className={
        open
          ? 'fixed inset-0 z-[100] flex flex-col bg-navy-950 text-white'
          : 'hidden'
      }
      role="dialog"
      aria-modal={open || undefined}
      aria-label="Mobile navigation"
      aria-hidden={open ? undefined : true}
      inert={open ? undefined : true}
    >
      <div className="flex h-[var(--header-height)] shrink-0 items-center justify-between border-b border-white/10 px-4 pt-[env(safe-area-inset-top)] sm:px-6">
        <a href="/" className="inline-flex items-center" aria-label="Che Xu Studio home">
          <img
            src="/che-xu-studio-web-design-seo-logo.png"
            alt=""
            width={1433}
            height={368}
            className="h-8 w-auto max-w-[min(100%,12.5rem)] object-contain object-left"
            decoding="async"
          />
        </a>
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
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-6"
        aria-label="Mobile primary"
      >
        <ul className="mx-auto w-full max-w-lg space-y-1">
          {rows.map((row) => {
            if (row.kind === 'group') {
              return (
                <li key={`group-${row.label}`} className="list-none">
                  <p
                    className={[
                      'mt-5 px-3 pb-1 pt-1 text-xs font-semibold uppercase tracking-[0.14em] first:mt-0',
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
                    'block rounded-md px-3 py-3.5 text-lg font-medium hover:bg-white/10 hover:text-white',
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
    </div>
  );

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
        SSR / closed: keep crawlable links in the document.
        Client: portal to body so the panel covers the full viewport above the sticky header.
      */}
      {mounted ? createPortal(panel, document.body) : panel}
    </div>
  );
}

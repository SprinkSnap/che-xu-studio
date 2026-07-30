import { useEffect, useId, useRef, useState } from 'react';
import { Menu, X } from 'lucide-react';

type NavChild = { label: string; href: string };
type NavItem = { label: string; href: string; children?: readonly NavChild[] };

interface Props {
  items: readonly NavItem[];
  primaryCta: { label: string; href: string };
  secondaryCta: { label: string; href: string };
}

export default function MobileNav({ items, primaryCta, secondaryCta }: Props) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const openRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
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

      {open && (
        <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Mobile navigation">
          <button
            type="button"
            className="absolute inset-0 bg-navy-950/70"
            aria-label="Close menu overlay"
            onClick={() => setOpen(false)}
          />
          <div
            id={panelId}
            className="absolute inset-y-0 right-0 flex w-[min(100%,22rem)] flex-col bg-navy-950 text-white shadow-lift"
          >
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <p className="font-display text-lg font-bold">Menu</p>
              <button
                ref={closeRef}
                type="button"
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-white/20"
                onClick={() => setOpen(false)}
              >
                <X className="h-5 w-5" aria-hidden="true" />
                <span className="sr-only">Close menu</span>
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Mobile primary">
              <ul className="space-y-1">
                {items.map((item) => (
                  <li key={item.href}>
                    <a
                      href={item.href}
                      className="block rounded-md px-3 py-3 text-base font-medium text-blue-100 hover:bg-white/10 hover:text-white"
                      onClick={() => setOpen(false)}
                    >
                      {item.label}
                    </a>
                    {item.children && (
                      <ul className="mb-2 ml-3 border-l border-white/10 pl-3">
                        {item.children.map((child) => (
                          <li key={child.href}>
                            <a
                              href={child.href}
                              className="block rounded-md px-3 py-2.5 text-sm text-blue-100/90 hover:bg-white/10 hover:text-white"
                              onClick={() => setOpen(false)}
                            >
                              {child.label}
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
            <div className="space-y-2 border-t border-white/10 p-4">
              <a href={primaryCta.href} className="btn btn-primary-on-dark w-full" onClick={() => setOpen(false)}>
                {primaryCta.label}
              </a>
              <a
                href={secondaryCta.href}
                className="btn-secondary w-full border-white/20 bg-transparent text-white hover:bg-white/10"
                onClick={() => setOpen(false)}
              >
                {secondaryCta.label}
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

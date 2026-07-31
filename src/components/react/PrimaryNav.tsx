import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { isCurrentPath, isNavItemActive, type NavItem } from '../../lib/navigation';

interface Props {
  items: readonly NavItem[];
  currentPath: string;
}

export default function PrimaryNav({ items, currentPath }: Props) {
  const [openLabel, setOpenLabel] = useState<string | null>(null);
  const rootRef = useRef<HTMLElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!openLabel) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenLabel(null);
    };

    const onPointerDown = (e: MouseEvent | PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpenLabel(null);
      }
    };

    const onFocusIn = (e: FocusEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpenLabel(null);
      }
    };

    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('focusin', onFocusIn);
    };
  }, [openLabel]);

  return (
    <nav ref={rootRef} className="hidden items-center gap-1 lg:flex" aria-label="Primary">
      {items.map((item) => {
        const active = isNavItemActive(currentPath, item);
        const hasChildren = Boolean(item.children?.length);
        const open = openLabel === item.label;
        const submenuId = `${menuId}-${item.label.replace(/\s+/g, '-').toLowerCase()}`;

        if (hasChildren) {
          return (
            <div key={item.label} className="relative">
              <button
                type="button"
                className={[
                  'inline-flex min-h-11 items-center gap-1 rounded-md px-3 text-sm font-medium transition',
                  active || open
                    ? 'bg-white/10 text-white'
                    : 'text-blue-100 hover:bg-white/10 hover:text-white',
                ].join(' ')}
                aria-expanded={open}
                aria-controls={submenuId}
                aria-haspopup="true"
                onClick={() => setOpenLabel(open ? null : item.label)}
              >
                {item.label}
                <ChevronDown
                  className={['h-4 w-4 transition', open ? 'rotate-180' : ''].join(' ')}
                  aria-hidden="true"
                />
              </button>
              {/* Keep submenu links in the DOM when closed for crawlability; toggle with hidden. */}
              <div
                id={submenuId}
                hidden={!open}
                className="absolute left-0 top-full z-50 mt-1 min-w-56 rounded-[var(--radius-md)] border border-white/10 bg-navy-900 p-2 shadow-lift"
              >
                <ul className="m-0 list-none p-0" role="list">
                  {item.children!.map((child) => {
                    const childCurrent = isCurrentPath(currentPath, child.href);
                    return (
                      <li key={child.href}>
                        <a
                          href={child.href}
                          className={[
                            'block rounded-md px-3 py-2.5 text-sm transition',
                            childCurrent
                              ? 'bg-white/15 font-semibold text-white'
                              : 'text-blue-100 hover:bg-white/10 hover:text-white',
                          ].join(' ')}
                          aria-current={childCurrent ? 'page' : undefined}
                          onClick={() => setOpenLabel(null)}
                        >
                          {child.label}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          );
        }

        if (!item.href) return null;

        const current = isCurrentPath(currentPath, item.href);
        return (
          <a
            key={item.href}
            href={item.href}
            className={[
              'inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium transition',
              current
                ? 'bg-white/10 text-white'
                : 'text-blue-100 hover:bg-white/10 hover:text-white',
            ].join(' ')}
            aria-current={current ? 'page' : undefined}
          >
            {item.label}
          </a>
        );
      })}
    </nav>
  );
}

import { useMemo, useState } from 'react';
import type { ServicePackage } from '../../config/packages';

interface Props {
  packages: ServicePackage[];
}

export default function PricingCompare({ packages }: Props) {
  const [selected, setSelected] = useState<string[]>([
    packages[0]?.id,
    packages[2]?.id,
  ].filter(Boolean) as string[]);

  const rows = useMemo(() => {
    const features = new Set<string>();
    for (const pkg of packages) {
      for (const item of pkg.includes) features.add(item);
    }
    return Array.from(features);
  }, [packages]);

  const visible = packages.filter((p) => selected.includes(p.id));

  function toggle(id: string) {
    setSelected((prev) => {
      if (prev.includes(id)) {
        if (prev.length === 1) return prev;
        return prev.filter((x) => x !== id);
      }
      if (prev.length >= 3) return [...prev.slice(1), id];
      return [...prev, id];
    });
  }

  return (
    <div className="space-y-5">
      <fieldset>
        <legend className="text-sm font-semibold text-navy-900">
          Compare packages (choose up to 3)
        </legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {packages.map((pkg) => {
            const active = selected.includes(pkg.id);
            return (
              <button
                key={pkg.id}
                type="button"
                aria-pressed={active}
                onClick={() => toggle(pkg.id)}
                className={
                  active
                    ? 'rounded-md bg-navy-900 px-3 py-2 text-sm font-medium text-white'
                    : 'rounded-md border border-border bg-white px-3 py-2 text-sm font-medium text-navy-800'
                }
              >
                {pkg.shortName}
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* Mobile: stacked cards */}
      <div className="grid gap-4 md:hidden">
        {visible.map((pkg) => (
          <article key={pkg.id} className="surface-card p-5">
            <h3 className="font-display text-xl font-bold text-navy-900">{pkg.name}</h3>
            <p className="mt-1 text-sm font-semibold text-navy-700">
              Starting at {pkg.priceLabel}
              {pkg.priceSuffix ?? ''}
            </p>
            <ul className="mt-4 space-y-2 text-sm text-ink-muted">
              {pkg.includes.map((item) => (
                <li key={item}>• {item}</li>
              ))}
            </ul>
            <button type="button" className="btn-primary mt-5 w-full" data-checkout-open={pkg.id}>
              Get started
            </button>
          </article>
        ))}
      </div>

      {/* Desktop comparison table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="sticky left-0 bg-white px-3 py-3 font-semibold text-navy-900">Feature</th>
              {visible.map((pkg) => (
                <th key={pkg.id} className="px-3 py-3 align-bottom">
                  <p className="font-display text-base font-bold text-navy-900">{pkg.shortName}</p>
                  <p className="mt-1 font-medium text-ink-muted">
                    {pkg.priceLabel}
                    {pkg.priceSuffix ?? ''}
                  </p>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((feature) => (
              <tr key={feature} className="border-b border-border/70">
                <th className="sticky left-0 bg-white px-3 py-3 font-medium text-ink">{feature}</th>
                {visible.map((pkg) => (
                  <td key={pkg.id} className="px-3 py-3 text-ink-muted">
                    {pkg.includes.includes(feature) ? (
                      <span className="font-semibold text-green-600">Included</span>
                    ) : (
                      <span>—</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

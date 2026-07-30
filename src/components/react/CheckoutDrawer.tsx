import { useEffect, useId, useRef, useState } from 'react';
import { X, ShieldCheck, Loader2 } from 'lucide-react';
import type { ServicePackage } from '../../config/packages';
import { track } from '../../lib/analytics';

interface Props {
  packages: ServicePackage[];
  turnstileSiteKey: string;
}

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        options: Record<string, unknown>,
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
  }
}

export default function CheckoutDrawer({ packages, turnstileSiteKey }: Props) {
  const [planId, setPlanId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState('');
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const lastFocus = useRef<HTMLElement | null>(null);
  const turnstileRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

  const pkg = packages.find((p) => p.id === planId) || null;

  useEffect(() => {
    function onOpenClick(e: Event) {
      const target = (e.target as HTMLElement).closest('[data-checkout-open]') as HTMLElement | null;
      if (!target) return;
      const id = target.getAttribute('data-checkout-open');
      if (!id) return;
      e.preventDefault();
      lastFocus.current = document.activeElement as HTMLElement;
      setPlanId(id);
      setOpen(true);
      setError(null);
      track('checkout_drawer_opened', { packageId: id });
      track('pricing_card_selected', { packageId: id });
    }
    document.addEventListener('click', onOpenClick);
    return () => document.removeEventListener('click', onOpenClick);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open]);

  useEffect(() => {
    if (!open || !turnstileSiteKey || !turnstileRef.current) return;

    let cancelled = false;

    function mount() {
      if (cancelled || !turnstileRef.current || !window.turnstile) return;
      if (widgetId.current) {
        window.turnstile.remove(widgetId.current);
        widgetId.current = null;
      }
      widgetId.current = window.turnstile.render(turnstileRef.current, {
        sitekey: turnstileSiteKey,
        callback: (token: string) => setTurnstileToken(token),
        'expired-callback': () => setTurnstileToken(''),
        'error-callback': () => setTurnstileToken(''),
      });
    }

    if (window.turnstile) {
      mount();
    } else {
      const existing = document.querySelector<HTMLScriptElement>('script[data-turnstile]');
      if (!existing) {
        const script = document.createElement('script');
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        script.dataset.turnstile = 'true';
        script.onload = mount;
        document.head.appendChild(script);
      } else {
        existing.addEventListener('load', mount);
      }
    }

    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) {
        window.turnstile.remove(widgetId.current);
        widgetId.current = null;
      }
    };
  }, [open, planId, turnstileSiteKey]);

  function close() {
    setOpen(false);
    setPlanId(null);
    setError(null);
    setTurnstileToken('');
    setTimeout(() => lastFocus.current?.focus(), 0);
  }

  async function onSubmit(e: { preventDefault: () => void; currentTarget: HTMLFormElement }) {
    e.preventDefault();
    if (!pkg || submitting) return;
    setSubmitting(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const payload = {
      planId: pkg.id,
      name: String(form.get('name') || ''),
      email: String(form.get('email') || ''),
      company: String(form.get('company') || ''),
      existingWebsite: String(form.get('existingWebsite') || ''),
      projectGoal: String(form.get('projectGoal') || ''),
      turnstileToken,
    };

    try {
      track('checkout_started', { packageId: pkg.id });
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as {
        url?: string;
        error?: string;
        quoteRequired?: boolean;
      };

      if (res.status === 422 && data.quoteRequired) {
        window.location.href = `/contact?plan=${encodeURIComponent(pkg.id)}&intent=quote`;
        return;
      }

      if (!res.ok || !data.url) {
        setError(data.error || 'Unable to start checkout. Please try again or contact us.');
        if (widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current);
        setTurnstileToken('');
        return;
      }

      window.location.href = data.url;
    } catch {
      setError('Network error. Your card was not charged. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!open || !pkg) return null;

  const isMonthly = pkg.billing === 'monthly';

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <button type="button" className="absolute inset-0 bg-navy-950/60" aria-label="Close checkout" onClick={close} />
      <div className="absolute inset-x-0 bottom-0 max-h-[92vh] overflow-y-auto rounded-t-[var(--radius-xl)] bg-white shadow-lift sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[min(100%,28rem)] sm:rounded-none sm:rounded-l-[var(--radius-xl)]">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-white px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-500">Quick start</p>
            <h2 id={titleId} className="font-display text-xl font-bold text-navy-900">
              {pkg.name}
            </h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-border"
            onClick={close}
          >
            <X className="h-5 w-5" aria-hidden="true" />
            <span className="sr-only">Close</span>
          </button>
        </div>

        <div className="space-y-5 px-5 py-5">
          <div className="rounded-[var(--radius-md)] border border-border bg-surface-muted p-4">
            <p className="text-sm text-ink-muted">Starting at</p>
            <p className="font-display text-3xl font-bold text-navy-900">
              {pkg.priceLabel}
              {pkg.priceSuffix ?? ''}
            </p>
            {pkg.timeline && <p className="mt-1 text-sm text-navy-700">Timeline: {pkg.timeline}</p>}
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-ink-muted">
              {pkg.disclosures.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-navy-900">Major inclusions</h3>
            <ul className="mt-2 space-y-1.5 text-sm text-ink-muted">
              {pkg.includes.slice(0, 6).map((item) => (
                <li key={item}>• {item}</li>
              ))}
              {pkg.includes.length > 6 && (
                <li>• Plus {pkg.includes.length - 6} more items in the full package</li>
              )}
            </ul>
          </div>

          <form className="space-y-3" onSubmit={onSubmit} noValidate>
            <div>
              <label htmlFor="co-name" className="text-sm font-medium text-navy-900">
                Name
              </label>
              <input id="co-name" name="name" required maxLength={100} className="mt-1 w-full rounded-md border border-border px-3 py-2.5" autoComplete="name" />
            </div>
            <div>
              <label htmlFor="co-email" className="text-sm font-medium text-navy-900">
                Email
              </label>
              <input id="co-email" name="email" type="email" required maxLength={254} className="mt-1 w-full rounded-md border border-border px-3 py-2.5" autoComplete="email" />
            </div>
            <div>
              <label htmlFor="co-company" className="text-sm font-medium text-navy-900">
                Business / company <span className="font-normal text-ink-muted">(optional)</span>
              </label>
              <input id="co-company" name="company" maxLength={150} className="mt-1 w-full rounded-md border border-border px-3 py-2.5" autoComplete="organization" />
            </div>
            <div>
              <label htmlFor="co-site" className="text-sm font-medium text-navy-900">
                Existing website <span className="font-normal text-ink-muted">(optional)</span>
              </label>
              <input id="co-site" name="existingWebsite" maxLength={500} className="mt-1 w-full rounded-md border border-border px-3 py-2.5" inputMode="url" />
            </div>
            <div>
              <label htmlFor="co-goal" className="text-sm font-medium text-navy-900">
                Project goal <span className="font-normal text-ink-muted">(optional)</span>
              </label>
              <textarea id="co-goal" name="projectGoal" maxLength={500} rows={3} className="mt-1 w-full rounded-md border border-border px-3 py-2.5" />
            </div>

            <div ref={turnstileRef} className="min-h-[65px]" />

            {error && (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                {error}
              </p>
            )}

            <button type="submit" className="btn-primary w-full" disabled={submitting || !turnstileToken}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Processing…
                </>
              ) : isMonthly ? (
                'Continue securely to Stripe'
              ) : (
                'Continue securely to Stripe'
              )}
            </button>
            <p className="flex items-start gap-2 text-xs leading-relaxed text-ink-muted">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-green-600" aria-hidden="true" />
              Payments are processed by Stripe. We never collect or store card numbers on this site.
              Starting-at packages without an approved fixed price will route to an exact quote instead of charging.
              See our <a className="underline" href="/privacy">privacy</a> and{' '}
              <a className="underline" href="/refund-cancellation-policy">cancellation</a> pages.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { track } from '../../lib/analytics';

interface Props {
  turnstileSiteKey: string;
  initialPlan?: string;
  initialIntent?: string;
}

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, options: Record<string, unknown>) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
  }
}

const services = [
  { value: 'not-sure', label: 'Not sure yet' },
  { value: 'premium-theme', label: 'Premium Theme Website' },
  { value: 'custom-website', label: 'Custom Website' },
  { value: 'custom-seo-launch', label: 'Custom Website + SEO Launch' },
  { value: 'seo-growth', label: 'SEO & Conversion Growth' },
  { value: 'website-care', label: 'Website Care & Maintenance' },
  { value: 'other', label: 'Something else' },
];

export default function ContactForm({ turnstileSiteKey, initialPlan, initialIntent }: Props) {
  const [showBrief, setShowBrief] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [turnstileToken, setTurnstileToken] = useState('');
  const [values, setValues] = useState({
    name: '',
    email: '',
    phone: '',
    serviceInterest: initialPlan && services.some((s) => s.value === initialPlan) ? initialPlan : 'not-sure',
    message:
      initialIntent === 'quote'
        ? 'I would like an exact quote for the selected package.'
        : '',
    marketingConsent: false,
    website: '',
    currentWebsite: '',
    businessType: '',
    primaryGoal: '',
    pagesFeatures: '',
    budgetRange: '',
    targetTimeline: '',
    preferredContact: '',
  });

  const turnstileRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

  useEffect(() => {
    if (!turnstileSiteKey || !turnstileRef.current) return;
    let cancelled = false;

    function mount() {
      if (cancelled || !turnstileRef.current || !window.turnstile) return;
      widgetId.current = window.turnstile.render(turnstileRef.current, {
        sitekey: turnstileSiteKey,
        callback: (token: string) => setTurnstileToken(token),
        'expired-callback': () => setTurnstileToken(''),
        'error-callback': () => setTurnstileToken(''),
      });
    }

    if (window.turnstile) mount();
    else {
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
  }, [turnstileSiteKey]);

  function update<K extends keyof typeof values>(key: K, value: (typeof values)[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(e: { preventDefault: () => void }) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setFieldErrors({});

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...values, turnstileToken }),
      });
      const data = (await res.json()) as {
        error?: string;
        fieldErrors?: Record<string, string>;
      };

      if (!res.ok) {
        if (data.fieldErrors) setFieldErrors(data.fieldErrors);
        setError(data.error || 'Unable to send your message. Please try again.');
        if (widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current);
        setTurnstileToken('');
        return;
      }

      track('contact_form_submitted', { serviceInterest: values.serviceInterest });
      setSuccess(true);
    } catch {
      setError('Network error. Please try again in a moment.');
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="surface-card p-6 sm:p-8" role="status" aria-live="polite">
        <h3 className="font-display text-2xl font-bold text-navy-900">Message received</h3>
        <p className="mt-3 text-ink-muted">
          Thanks for reaching out. We’ll review your enquiry and respond by email. If you shared a phone
          number and preferred phone contact, we may follow up that way.
        </p>
        <p className="mt-4 text-sm text-ink-muted">What happens next: we confirm the best-fit package or quote scope, then outline clear next steps.</p>
      </div>
    );
  }

  return (
    <form className="surface-card space-y-4 p-6 sm:p-8" onSubmit={onSubmit} noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" error={fieldErrors.name} htmlFor="name">
          <input
            id="name"
            required
            maxLength={100}
            className="input"
            value={values.name}
            onChange={(e) => update('name', e.target.value)}
            autoComplete="name"
          />
        </Field>
        <Field label="Email" error={fieldErrors.email} htmlFor="email">
          <input
            id="email"
            type="email"
            required
            maxLength={254}
            className="input"
            value={values.email}
            onChange={(e) => update('email', e.target.value)}
            autoComplete="email"
          />
        </Field>
      </div>

      <Field label="Service interest" error={fieldErrors.serviceInterest} htmlFor="serviceInterest">
        <select
          id="serviceInterest"
          className="input"
          value={values.serviceInterest}
          onChange={(e) => update('serviceInterest', e.target.value)}
        >
          {services.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Message" error={fieldErrors.message} htmlFor="message">
        <textarea
          id="message"
          required
          maxLength={4000}
          rows={5}
          className="input"
          value={values.message}
          onChange={(e) => update('message', e.target.value)}
        />
      </Field>

      <Field
        label="Phone (optional)"
        error={fieldErrors.phone}
        htmlFor="phone"
      >
        <input
          id="phone"
          maxLength={40}
          className="input"
          value={values.phone}
          onChange={(e) => update('phone', e.target.value)}
          autoComplete="tel"
        />
      </Field>

      {/* Honeypot */}
      <div className="hidden" aria-hidden="true">
        <label htmlFor="website">Website</label>
        <input
          id="website"
          tabIndex={-1}
          autoComplete="off"
          value={values.website}
          onChange={(e) => update('website', e.target.value)}
        />
      </div>

      <label className="flex items-start gap-3 text-sm text-ink-muted">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4"
          checked={values.marketingConsent}
          onChange={(e) => update('marketingConsent', e.target.checked)}
        />
        <span>
          I agree to receive occasional project tips or updates from Che Xu Studio. This is separate from
          handling my service enquiry. You can unsubscribe anytime.
        </span>
      </label>

      <button
        type="button"
        className="text-sm font-semibold text-blue-500"
        onClick={() => setShowBrief((v) => !v)}
        aria-expanded={showBrief}
      >
        {showBrief ? 'Hide detailed project brief' : 'Add a detailed project brief (optional)'}
      </button>

      {showBrief && (
        <div className="space-y-4 rounded-[var(--radius-md)] border border-border bg-surface-muted p-4">
          <Field label="Current website" htmlFor="currentWebsite">
            <input id="currentWebsite" className="input" maxLength={500} value={values.currentWebsite} onChange={(e) => update('currentWebsite', e.target.value)} />
          </Field>
          <Field label="Business type" htmlFor="businessType">
            <input id="businessType" className="input" maxLength={120} value={values.businessType} onChange={(e) => update('businessType', e.target.value)} />
          </Field>
          <Field label="Primary goal" htmlFor="primaryGoal">
            <textarea id="primaryGoal" className="input" rows={2} maxLength={500} value={values.primaryGoal} onChange={(e) => update('primaryGoal', e.target.value)} />
          </Field>
          <Field label="Required pages / features" htmlFor="pagesFeatures">
            <textarea id="pagesFeatures" className="input" rows={2} maxLength={1000} value={values.pagesFeatures} onChange={(e) => update('pagesFeatures', e.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Budget range" htmlFor="budgetRange">
              <select id="budgetRange" className="input" value={values.budgetRange} onChange={(e) => update('budgetRange', e.target.value)}>
                <option value="">Prefer not to say</option>
                <option value="under-2k">Under CAD $2,000</option>
                <option value="2k-5k">CAD $2,000–$5,000</option>
                <option value="5k-10k">CAD $5,000–$10,000</option>
                <option value="10k-plus">CAD $10,000+</option>
                <option value="monthly">Looking at a monthly plan</option>
                <option value="unsure">Unsure</option>
              </select>
            </Field>
            <Field label="Target timeline" htmlFor="targetTimeline">
              <select id="targetTimeline" className="input" value={values.targetTimeline} onChange={(e) => update('targetTimeline', e.target.value)}>
                <option value="">Flexible / not sure</option>
                <option value="asap">As soon as possible</option>
                <option value="1-2-months">1–2 months</option>
                <option value="3-plus-months">3+ months</option>
                <option value="flexible">Flexible</option>
              </select>
            </Field>
          </div>
          <Field label="Preferred contact method" htmlFor="preferredContact">
            <select id="preferredContact" className="input" value={values.preferredContact} onChange={(e) => update('preferredContact', e.target.value)}>
              <option value="">No preference</option>
              <option value="email">Email</option>
              <option value="phone">Phone</option>
              <option value="either">Either</option>
            </select>
          </Field>
        </div>
      )}

      <div ref={turnstileRef} className="min-h-[65px]" />

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {error}
        </p>
      )}

      <button type="submit" className="btn-primary" disabled={submitting || !turnstileToken}>
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Sending…
          </>
        ) : (
          'Send message'
        )}
      </button>
      <p className="text-xs text-ink-muted">
        By sending this form you agree to our <a className="underline" href="/privacy">privacy policy</a> and{' '}
        <a className="underline" href="/terms">terms</a>. We use your details only to respond to this enquiry
        unless you opt in to marketing updates.
      </p>

      <style>{`
        .input {
          margin-top: 0.25rem;
          width: 100%;
          border-radius: 0.625rem;
          border: 1px solid var(--color-border);
          padding: 0.65rem 0.75rem;
          background: white;
        }
      `}</style>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  children: ReactNode;
}) {
  const errorId = error ? `${htmlFor}-error` : undefined;
  return (
    <div>
      <label htmlFor={htmlFor} className="text-sm font-medium text-navy-900">
        {label}
      </label>
      <div aria-describedby={errorId}>{children}</div>
      {error && (
        <p id={errorId} className="mt-1 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

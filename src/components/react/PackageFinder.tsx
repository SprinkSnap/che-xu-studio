import { useMemo, useState } from 'react';
import {
  finderQuestions,
  recommendPackage,
  type DesignAnswer,
  type FinderAnswers,
  type NeedAnswer,
  type SeoAnswer,
} from '../../lib/package-finder';
import { track } from '../../lib/analytics';
import { ArrowLeft, ArrowRight, CheckCircle2 } from 'lucide-react';

export default function PackageFinder() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<FinderAnswers>({});
  const [started, setStarted] = useState(false);

  const recommendation = useMemo(() => recommendPackage(answers), [answers]);

  const visibleQuestion = useMemo(() => {
    if (answers.need === 'care' || answers.need === 'growth') return null;
    if (step === 0) return finderQuestions[0];
    if (step === 1) return finderQuestions[1];
    if (answers.design === 'custom') return finderQuestions[2];
    return null;
  }, [answers.design, answers.need, step]);

  function start() {
    setStarted(true);
    track('package_finder_started');
  }

  function selectNeed(value: NeedAnswer) {
    const next = { need: value } as FinderAnswers;
    setAnswers(next);
    if (value === 'care' || value === 'growth') {
      track('package_finder_completed');
      const rec = recommendPackage(next);
      if (rec) track('package_recommended', { packageId: rec.packageId });
      setStep(3);
      return;
    }
    setStep(1);
  }

  function selectDesign(value: DesignAnswer) {
    const next = { ...answers, design: value, seo: undefined };
    setAnswers(next);
    if (value === 'premium-theme') {
      track('package_finder_completed');
      const rec = recommendPackage(next);
      if (rec) track('package_recommended', { packageId: rec.packageId });
      setStep(3);
      return;
    }
    setStep(2);
  }

  function selectSeo(value: SeoAnswer) {
    const next = { ...answers, seo: value };
    setAnswers(next);
    track('package_finder_completed');
    const rec = recommendPackage(next);
    if (rec) track('package_recommended', { packageId: rec.packageId });
    setStep(3);
  }

  function reset() {
    setAnswers({});
    setStep(0);
    setStarted(false);
  }

  function goBack() {
    if (step <= 0) {
      reset();
      return;
    }
    if (step === 3) {
      if (answers.need === 'care' || answers.need === 'growth') {
        setAnswers({});
        setStep(0);
        return;
      }
      if (answers.design === 'premium-theme') {
        setAnswers({ need: 'new-website' });
        setStep(1);
        return;
      }
      setAnswers({ need: answers.need, design: answers.design });
      setStep(2);
      return;
    }
    if (step === 2) {
      setAnswers({ need: answers.need });
      setStep(1);
      return;
    }
    if (step === 1) {
      setAnswers({});
      setStep(0);
    }
  }

  return (
    <div className="surface-card overflow-hidden">
      <div className="border-b border-border bg-blue-50 px-5 py-4 sm:px-7">
        <p className="text-sm font-semibold text-blue-500">Guided package finder</p>
        <h3 className="mt-1 font-display text-2xl font-bold text-navy-900">
          Which service fits your goal?
        </h3>
        <p className="mt-2 text-sm text-ink-muted">
          Answer up to three questions. We’ll recommend one package and keep every other option available.
        </p>
      </div>

      <div className="p-5 sm:p-7">
        {!started && (
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-ink-muted">
              Takes less than a minute. No account required. You can still compare all packages or talk to us first.
            </p>
            <button type="button" className="btn-primary" onClick={start}>
              Start the finder
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}

        {started && step < 3 && visibleQuestion && (
          <div>
            <div className="mb-4 flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">
                Question {Math.min(step + 1, 3)} of 3
              </p>
              <button type="button" className="text-sm font-medium text-blue-500" onClick={goBack}>
                <span className="inline-flex items-center gap-1">
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
                </span>
              </button>
            </div>
            <fieldset>
              <legend className="font-display text-xl font-bold text-navy-900">
                {visibleQuestion.prompt}
              </legend>
              <div className="mt-5 grid gap-3" role="radiogroup" aria-label={visibleQuestion.prompt}>
                {visibleQuestion.options.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className="rounded-[var(--radius-md)] border border-border bg-white px-4 py-4 text-left transition hover:border-blue-400 hover:shadow-soft focus-visible:border-blue-500"
                    onClick={() => {
                      if (visibleQuestion.id === 'need') selectNeed(option.value as NeedAnswer);
                      if (visibleQuestion.id === 'design') selectDesign(option.value as DesignAnswer);
                      if (visibleQuestion.id === 'seo') selectSeo(option.value as SeoAnswer);
                    }}
                  >
                    <span className="block font-semibold text-navy-900">{option.label}</span>
                    <span className="mt-1 block text-sm text-ink-muted">{option.description}</span>
                  </button>
                ))}
              </div>
            </fieldset>
          </div>
        )}

        {started && step === 3 && recommendation && (
          <div aria-live="polite">
            <div className="mb-4 flex items-center justify-between gap-3">
              <p className="inline-flex items-center gap-2 text-sm font-semibold text-green-600">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Recommendation ready
              </p>
              <button type="button" className="text-sm font-medium text-blue-500" onClick={goBack}>
                Change answers
              </button>
            </div>
            <h3 className="font-display text-2xl font-bold text-navy-900">
              {recommendation.pkg.name}
            </h3>
            <p className="mt-2 text-sm font-medium text-navy-700">
              Starting at {recommendation.pkg.priceLabel}
              {recommendation.pkg.priceSuffix ?? ''}
              {recommendation.pkg.timeline ? ` · ${recommendation.pkg.timeline}` : ''}
            </p>
            <p className="mt-4 text-sm leading-relaxed text-ink-muted sm:text-base">
              {recommendation.reason}
            </p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <a
                href={`/contact?plan=${encodeURIComponent(recommendation.pkg.id)}&intent=quote`}
                className="btn-primary"
              >
                Continue with this package
              </a>
              <a href={recommendation.pkg.href} className="btn-secondary">
                View full package
              </a>
              <a href="/pricing" className="btn-secondary">
                Compare all packages
              </a>
            </div>
            <button type="button" className="mt-4 text-sm text-ink-muted underline" onClick={reset}>
              Start over
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

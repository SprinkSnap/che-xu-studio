/** Resolve public Turnstile site key from Worker runtime and/or build-time env. */

export function resolvePublicTurnstileSiteKey(sources: {
  runtime?: string | null;
  build?: string | null;
}): string {
  const runtime = sources.runtime?.trim() || '';
  if (runtime) return runtime;
  return sources.build?.trim() || '';
}

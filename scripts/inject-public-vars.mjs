/**
 * Inject public Worker vars from the current process env into a wrangler config.
 * Workers Builds environment variables are available here during `npm run build`
 * and `npm run cf:deploy`, which is more reliable than dashboard-only vars.
 */

const PUBLIC_VAR_KEYS = ['PUBLIC_TURNSTILE_SITE_KEY', 'PUBLIC_SITE_URL', 'PUBLIC_CF_WEB_ANALYTICS_TOKEN'];

/**
 * @param {Record<string, unknown>} config
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{ log?: boolean }} [options]
 */
export function injectPublicWorkerVars(config, env = process.env, { log = true } = {}) {
  const vars = { ...(config.vars && typeof config.vars === 'object' ? config.vars : {}) };
  const applied = [];

  for (const key of PUBLIC_VAR_KEYS) {
    const value = env[key]?.trim();
    if (!value) continue;
    vars[key] = value;
    applied.push(key);
  }

  if (applied.length > 0) {
    config.vars = vars;
    if (log) {
      console.log(`[cf-vars] Injected wrangler vars: ${applied.join(', ')}`);
    }
  } else if (log) {
    console.warn(
      [
        '[cf-vars] No PUBLIC_* vars found in process.env.',
        'Set these in Workers Builds → Settings → Environment variables:',
        '  PUBLIC_TURNSTILE_SITE_KEY',
        '  PUBLIC_SITE_URL=https://chexustudio.com',
        'And set Worker secret TURNSTILE_SECRET_KEY in the Worker Settings.',
      ].join('\n'),
    );
  }

  return { config, applied };
}

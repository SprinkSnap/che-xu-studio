/**
 * Collect Worker runtime secrets from the current process env (Workers Builds
 * encrypted secrets) so `wrangler deploy --secrets-file` can re-apply them.
 *
 * Plain dashboard Variables are wiped when deploy does not keep vars; encrypted
 * Secrets should persist, but re-uploading from Builds is the reliable path.
 */

export const RUNTIME_SECRET_KEYS = ['TURNSTILE_SECRET_KEY', 'RESEND_API_KEY'];

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {Record<string, string>}
 */
export function collectRuntimeSecrets(env = process.env) {
  /** @type {Record<string, string>} */
  const secrets = {};
  for (const key of RUNTIME_SECRET_KEYS) {
    const value = env[key]?.trim();
    if (!value) continue;
    secrets[key] = value;
  }
  return secrets;
}

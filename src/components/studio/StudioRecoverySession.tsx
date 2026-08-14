import { useEffect, useState } from 'react';
import { tryCreateSupabaseBrowserClient } from '../lib/supabase/browser';

/**
 * Hydrates a Supabase recovery session from URL (PKCE code or hash tokens)
 * into host-only cookies, then reloads so the Astro SSR page can see the session.
 * Never logs tokens.
 */
export default function StudioRecoverySession() {
  const [status, setStatus] = useState<'idle' | 'working' | 'ready' | 'missing'>('idle');

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const url = new URL(window.location.href);
      const hasCode = url.searchParams.has('code');
      const hash = window.location.hash.replace(/^#/, '');
      const hasRecoveryHash =
        hash.includes('type=recovery') ||
        hash.includes('access_token=') ||
        hash.includes('refresh_token=');

      if (!hasCode && !hasRecoveryHash) {
        setStatus('missing');
        return;
      }

      setStatus('working');
      const client = tryCreateSupabaseBrowserClient();
      if (!client) {
        setStatus('missing');
        return;
      }

      // getSession / exchangeCodeForSession via SSR client cookie bridge.
      const { data, error } = await client.auth.getSession();
      if (cancelled) return;

      if (error || !data.session) {
        // Attempt explicit code exchange when present.
        if (hasCode) {
          const code = url.searchParams.get('code');
          if (code) {
            const exchanged = await client.auth.exchangeCodeForSession(code);
            if (cancelled) return;
            if (exchanged.error || !exchanged.data.session) {
              setStatus('missing');
              return;
            }
          }
        } else {
          setStatus('missing');
          return;
        }
      }

      // Strip sensitive query/hash before reload so tokens are not retained in history.
      url.searchParams.delete('code');
      window.history.replaceState({}, '', `${url.pathname}${url.search}`);
      setStatus('ready');
      window.location.replace(url.pathname + url.search);
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  if (status === 'working') {
    return (
      <p className="studio-auth-lede mt-4" role="status">
        Confirming reset link…
      </p>
    );
  }

  return null;
}

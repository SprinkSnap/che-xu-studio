// @ts-check
import { defineConfig, sessionDrivers } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: process.env.PUBLIC_SITE_URL || 'https://chexustudio.com',
  adapter: cloudflare({
    imageService: 'compile',
    // Avoid requiring Cloudflare API auth during local builds/prerender.
    remoteBindings: false,
    prerenderEnvironment: 'node',
    persistState: true,
  }),
  // Astro's built-in checkOrigin rejects form POSTs when the Origin header is
  // missing (common in Outlook/Hotmail in-app browsers). CSRF for mutations is
  // enforced in app code via isSameOriginMutation (Origin / Referer /
  // Sec-Fetch-Site). allowedDomains keeps forwarded-host validation aligned.
  security: {
    checkOrigin: false,
    allowedDomains: [
      { hostname: 'chexustudio.com', protocol: 'https' },
      { hostname: 'www.chexustudio.com', protocol: 'https' },
      { hostname: 'studio.chexustudio.com', protocol: 'https' },
    ],
  },
  // This site does not use Astro.session. Without an explicit non-KV driver,
  // @astrojs/cloudflare auto-enables cloudflareKVBinding("SESSION"), and
  // Workers Builds repeatedly tries to create that namespace (API error 10014
  // when a *-session KV title already exists from a prior deploy).
  session: {
    // Non-KV driver (typed). Avoids SESSION KV auto-provision on Workers Builds.
    driver: sessionDrivers.lruCache(),
  },
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
  prefetch: {
    prefetchAll: false,
    defaultStrategy: 'hover',
  },
});

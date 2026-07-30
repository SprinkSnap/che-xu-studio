// @ts-check
import { defineConfig, sessionDrivers } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: process.env.PUBLIC_SITE_URL || 'https://example.com',
  adapter: cloudflare({
    imageService: 'compile',
    // Avoid requiring Cloudflare API auth during local builds/prerender.
    remoteBindings: false,
    prerenderEnvironment: 'node',
    persistState: true,
  }),
  // This site does not use Astro.session. Without an explicit non-KV driver,
  // @astrojs/cloudflare auto-enables cloudflareKVBinding("SESSION"), and
  // Workers Builds repeatedly tries to create that namespace (API error 10014
  // when a *-session KV title already exists from a prior deploy).
  session: {
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

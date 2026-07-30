// @ts-check
import { defineConfig } from 'astro/config';
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
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
  prefetch: {
    prefetchAll: false,
    defaultStrategy: 'hover',
  },
});

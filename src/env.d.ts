/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

type RateLimitBinding = {
  limit: (options: { key: string }) => Promise<{ success: boolean }>;
};

type AiBinding = {
  run: (
    model: string,
    inputs: Record<string, unknown>,
  ) => Promise<unknown>;
};

interface CloudflareEnv {
  /** Present only after a real D1 database_id is committed and deployed. */
  DB?: D1Database;
  AI?: AiBinding;
  ASSETS: Fetcher;
  CHAT_RATE_LIMITER?: RateLimitBinding;
  CONTACT_RATE_LIMITER?: RateLimitBinding;

  TURNSTILE_SECRET_KEY?: string;

  PUBLIC_TURNSTILE_SITE_KEY?: string;
  PUBLIC_SITE_URL?: string;
  PUBLIC_CF_WEB_ANALYTICS_TOKEN?: string;
  AI_MODEL?: string;
}

interface ImportMetaEnv {
  readonly PUBLIC_TURNSTILE_SITE_KEY?: string;
  readonly PUBLIC_SITE_URL?: string;
  readonly PUBLIC_CF_WEB_ANALYTICS_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

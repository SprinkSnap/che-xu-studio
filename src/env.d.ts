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
  /** Studio auth login / recovery rate limiter. */
  AUTH_RATE_LIMITER?: RateLimitBinding;
  /** Public Invoice Checkout Session creation rate limiter. */
  CHECKOUT_RATE_LIMITER?: RateLimitBinding;

  TURNSTILE_SECRET_KEY?: string;

  /** Resend API key for contact-form inbox notifications. */
  RESEND_API_KEY?: string;
  /** Verified From address, e.g. "Che Xu Studio <info@chexustudio.com>". */
  CONTACT_FROM_EMAIL?: string;
  /** Override notify inbox (defaults to siteConfig.contact.email). */
  CONTACT_NOTIFY_EMAIL?: string;

  PUBLIC_TURNSTILE_SITE_KEY?: string;
  PUBLIC_SITE_URL?: string;
  PUBLIC_CF_WEB_ANALYTICS_TOKEN?: string;
  AI_MODEL?: string;

  /**
   * Gate for unfinished Studio OS surfaces (/admin, /proposal, /invoice).
   * Production Studio requires authentication (Phase 5) plus this flag.
   */
  STUDIO_OS_ENABLED?: string;

  /** Canonical Studio origin for password-reset redirects, e.g. https://studio.chexustudio.com */
  STUDIO_BASE_URL?: string;

  /** Studio OS — Supabase project URL (browser-safe). */
  PUBLIC_SUPABASE_URL?: string;
  /** Studio OS — Supabase publishable key (browser-safe). */
  PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
  /**
   * Studio OS — Supabase secret key (server-only).
   * Never prefix with PUBLIC_. Never expose to browser bundles.
   */
  SUPABASE_SECRET_KEY?: string;

  /** Stripe publishable key (browser-safe if needed). */
  PUBLIC_STRIPE_PUBLISHABLE_KEY?: string;
  /**
   * Stripe secret key (server-only). Never prefix with PUBLIC_.
   * Never log or return from APIs.
   */
  STRIPE_SECRET_KEY?: string;
  /**
   * Stripe webhook signing secret (server-only). Never prefix with PUBLIC_.
   */
  STRIPE_WEBHOOK_SECRET?: string;
}

interface ImportMetaEnv {
  readonly PUBLIC_TURNSTILE_SITE_KEY?: string;
  readonly PUBLIC_SITE_URL?: string;
  readonly PUBLIC_CF_WEB_ANALYTICS_TOKEN?: string;
  /** See CloudflareEnv.STUDIO_OS_ENABLED — used by preview/e2e when set at build/runtime. */
  readonly STUDIO_OS_ENABLED?: string;
  readonly STUDIO_BASE_URL?: string;
  readonly PUBLIC_SUPABASE_URL?: string;
  readonly PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
  /** Server-only when provided via Vite/process env for local tooling — never PUBLIC_. */
  readonly SUPABASE_SECRET_KEY?: string;
  readonly PUBLIC_STRIPE_PUBLISHABLE_KEY?: string;
  /** Server-only — never PUBLIC_. */
  readonly STRIPE_SECRET_KEY?: string;
  /** Server-only — never PUBLIC_. */
  readonly STRIPE_WEBHOOK_SECRET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare namespace App {
  interface Locals {
    /**
     * Request-scoped Studio Supabase user client.
     * Null when public Supabase env is not configured. Never a fake user client.
     */
    studioSupabase?: import('./lib/supabase/types').StudioSupabaseClient | null;
    /**
     * Lightweight auth user mirror when Studio membership is authorized.
     * Prefer `studioAuth` for role/permission decisions.
     */
    studioUser?: import('./lib/supabase/types').StudioAuthUser | null;
    /**
     * Authorized Studio membership context (active profile + role).
     * Null when anonymous, non-member, or suspended.
     */
    studioAuth?: import('./lib/auth/studio-context').StudioAuthContext | null;
  }
}

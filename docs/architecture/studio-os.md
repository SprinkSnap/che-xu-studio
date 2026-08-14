# Studio OS — Architecture Decision Record

**Status:** Accepted (Phase 2 foundation)  
**Date:** 2026-08-14  
**Related:** [Phase 1 audit](../studio-os/PHASE-1-AUDIT.md)

This document locks architectural boundaries for the private Che Xu Studio operating system. It does not authorize implementing Supabase, Stripe, CRUD, or authentication in Phase 2.

---

## Existing architecture

| Layer | Role |
| --- | --- |
| Astro 7 + React 19 islands | Public marketing site routing/SSR; interactive islands for forms, nav, chat |
| Cloudflare Workers (`che-xu-studio-site`) | Hosting via `@astrojs/cloudflare` |
| Cloudflare D1 | Consented lead persistence from `/api/contact` |
| Workers AI | `/api/chat` assistant |
| Turnstile + rate limit bindings | Abuse protection on public mutations |
| Zod | Request validation |
| Resend | Soft-fail lead email notifications |
| Middleware (`src/middleware.ts`) | Security headers + cache policy |
| SEO | Canonical, robots meta, OG/Twitter, JSON-LD, sitemap allowlist, robots.txt |
| Tests | Vitest unit + Playwright e2e (incl. axe) |

Public layout: `src/layouts/BaseLayout.astro` (marketing header/footer, sticky CTA, chat).  
Design tokens: `src/styles/global.css` (Source Serif 4, DM Sans, navy, brand blue).

---

## Studio architecture decision

1. **Public site remains Astro** on Cloudflare Workers. **No Next.js migration.**
2. **Studio OS lives in the same repository and Worker** as route families under `/admin`, `/proposal/[token]`, and `/invoice/[token]`.
3. **Astro owns routing and server rendering.** React islands may be used later for rich admin interactions; Phase 2 navigation is static Astro markup.
4. **Marketing components must not become tightly coupled** to Studio. Studio uses dedicated layouts (`StudioLayout`, `ClientDocumentLayout`) and does not mount marketing header, footer, chat, or sticky CTA.
5. **Reuse brand tokens and fonts** from `global.css`; Studio-specific chrome lives in `src/styles/studio.css`.

---

## URL architecture

### Public marketing (apex)

Production: `https://chexustudio.com`  
Routes: `/`, `/services/*`, `/pricing`, `/about`, `/work`, `/contact`, `/insights`, legal pages.  
Layout: `BaseLayout.astro`.

### Private Studio application

Preferred production hostname: `https://studio.chexustudio.com`  
Internal Astro route prefix: `/admin`

| Path | Purpose (later phases) |
| --- | --- |
| `/admin` | Dashboard |
| `/admin/clients` | Clients |
| `/admin/projects` | Projects |
| `/admin/proposals` | Proposals |
| `/admin/invoices` | Invoices |
| `/admin/payments` | Payments |
| `/admin/templates` | Templates |
| `/admin/settings` | Settings |

Local development: `http://localhost:4321/admin`.

### Client-facing documents

| Path | Purpose |
| --- | --- |
| `/proposal/[token]` | Secure proposal view/accept |
| `/invoice/[token]` | Secure invoice view/pay |

Layout: `ClientDocumentLayout.astro`. Tokens are capability URLs; secrecy of the URL alone is never sufficient (hashed tokens + server authz in later phases).

### Cloudflare subdomain routing (future, same Worker)

Do **not** duplicate the project for the subdomain.

Recommended approach when ready for production Studio:

1. Attach custom domain `studio.chexustudio.com` to the existing Worker `che-xu-studio-site`.
2. Optionally add middleware host awareness so `studio.chexustudio.com/` maps conceptually to the Studio surface (e.g. redirect `/` → `/admin` on that host only).
3. Keep apex `chexustudio.com` marketing routes unchanged.
4. Continue serving `/admin`, `/proposal/*`, and `/invoice/*` from the same Worker entrypoint.

Phase 2 does not implement host-based redirects; path-based routes are the source of truth.

---

## Data architecture

| Data | Store | Phase |
| --- | --- | --- |
| Marketing leads / contact | Cloudflare D1 (existing) | Keep intact |
| Studio business entities | Supabase Postgres + RLS | Phase 3–4+ |
| Administrator identity | Supabase Auth | Phase 5 |
| Private PDFs / documents | Supabase Storage (non-enumerable) | Phase 13 |
| Payments | Stripe Checkout + webhooks (no card data in our DB) | Phase 11 |
| Transactional email | Resend + `email_logs` | Phase 12 |
| PDF HTML → file | Cloudflare Browser Rendering + shared print CSS | Phase 13 |

**Supabase integration begins in Phase 3 and must not be introduced in Phase 2.**

---

## Service boundaries

| Service | Boundary |
| --- | --- |
| Supabase | Server-side client with service role only on the Worker; anon key only if strictly needed for Auth client flows; never ship service role to the browser |
| Stripe | Server-created Checkout Sessions; webhook signature verification + idempotency; success pages never mark paid |
| Resend | Server-only API key; studio transactional templates separate from marketing lead notify |
| PDF | Generate from the same branded HTML used for web document views |
| Cloudflare | Workers host, D1 leads, Turnstile, rate limits, future Browser Rendering; keep deploy wrappers (`prepare-cf-deploy`, `cf-deploy`) |

---

## Security boundaries

| Surface | Access model |
| --- | --- |
| Marketing routes | Public |
| `/admin/*` | Private — Supabase Auth + server authorization (Phase 5). Phase 2: gated by `STUDIO_OS_ENABLED` in non-dev environments; **no fake passwords** |
| `/proposal/*`, `/invoice/*` | Capability-style secure links (high-entropy tokens, hashed at rest) |
| Payments | Processed by Stripe; no raw card data stored |
| Secrets | Server-only env/bindings |
| Mutations | Zod validation + server authorization; CSRF-safe patterns when cookie sessions exist |

Auth type contracts live in `src/lib/auth/types.ts` for Phase 5 insertion. Middleware already isolates private paths for cache/robots; Phase 5 adds `RequireStudioAdmin` after path detection.

**Production must not publish `studio.chexustudio.com` or set `STUDIO_OS_ENABLED=true` until authentication (Phase 5) is ready.**

---

## SEO boundaries

| Route family | Indexing |
| --- | --- |
| Marketing | May be indexed when `siteConfig.allowIndexing` is true |
| `/admin/*` | Never — meta robots + `X-Robots-Tag: noindex, nofollow, noarchive` |
| `/proposal/*`, `/invoice/*` | Never — same robots policy |
| Sitemap | Explicit public allowlist only; private families excluded |
| Public JSON-LD navigation | Marketing destinations only; never Studio routes |

Sitemap `lastmod`: omitted in Phase 2 rather than emitting inaccurate build-time timestamps. Restore only with real significant modification dates.

`robots.txt` may `Disallow` `/admin/`, `/proposal/`, `/invoice/` as defense-in-depth. This is **not** access control.

---

## Cache boundaries

| Route family | Cache-Control |
| --- | --- |
| Marketing (most) | Existing short public SWR |
| `/work`, `/api/*` | Existing `no-store` |
| `/admin/*`, `/proposal/*`, `/invoice/*` | `private, no-store` |

---

## Layout & component strategy

- `StudioLayout.astro` — private shell (sidebar, mobile nav, no marketing chrome).
- `ClientDocumentLayout.astro` — editorial client documents / future print CSS.
- Primitives under `src/components/studio/*` — compose pages; avoid over-abstraction.
- Navigation config: `src/lib/studio/navigation.ts`.

---

## Testing expectations

Phase 2 adds unit coverage for private-path helpers, sitemap allowlist exclusion, and navigation active states; Playwright covers Studio shell, nav destinations, mobile keyboard nav, robots/cache headers, and public regression smoke.

---

## Explicitly deferred

Supabase packages/migrations, login UI, admin accounts, RLS, client/project/proposal/invoice CRUD, Stripe, webhooks, email automation, reminders, PDF engine, live dashboard metrics, production Studio DNS.

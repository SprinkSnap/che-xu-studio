# Studio OS — Phase 1 Repository Audit

**Date:** 2026-08-14  
**Branch context:** `cursor/studio-os-phase-1-audit-3549`  
**Scope:** Read-only audit of SprinkSnap/che-xu-studio. No production behavior changes in this phase.

---

## Executive summary

The repository is a **production-ready Astro 7 marketing site** for Che Xu Studio, hosted on **Cloudflare Workers**, with **D1** lead storage, **Workers AI** chat, **Turnstile**, **rate limiting**, and **Resend** lead notifications.

There is **no Studio OS** yet: no admin UI, no Supabase, no Stripe integration, no proposals/invoices, and no administrator authentication. Checkout routes exist only as placeholders that redirect users to the contact quote flow.

Studio OS should be layered onto this stack without migrating the public site or rewriting working marketing components.

---

## Confirmed stack

| Area | Current state | Version / location |
| --- | --- | --- |
| Framework | Astro (SSR + static) | `astro@^7.1.6` |
| UI islands | React 19 | `react@^19.2.8`, `@astrojs/react` |
| Styling | Tailwind CSS 4 via Vite plugin | `tailwindcss@^4.3.3`, `src/styles/global.css` |
| Language | TypeScript (strict Astro config) | `tsconfig.json` extends `astro/tsconfigs/strict` |
| Validation | Zod 4 | `zod@^4.4.3`, `src/lib/validation.ts` |
| Hosting | Cloudflare Workers via `@astrojs/cloudflare` | `wrangler.jsonc`, worker name `che-xu-studio-site` |
| Database (public leads) | Cloudflare D1 | binding `DB`, `migrations/0001_init.sql` |
| AI | Cloudflare Workers AI | binding `AI`, chat at `/api/chat` |
| Bot protection | Cloudflare Turnstile | contact + optional chat |
| Abuse control | Cloudflare Rate Limiting bindings | `CONTACT_RATE_LIMITER`, `CHAT_RATE_LIMITER` |
| Email | Resend (HTTP API, soft-fail) | `src/lib/notify-email.ts` |
| IDs | `nanoid` for lead IDs | `/api/contact` |
| Tests | Vitest (unit) + Playwright (e2e + axe) | `tests/unit/*`, `tests/e2e/*` |
| Lint / format | ESLint + Prettier | `eslint.config.js`, `prettier.config.mjs` |

**Explicitly absent today:** Supabase, Stripe SDK/webhooks, admin auth, RLS, PDF generation, Browser Rendering, Studio OS schema, `/admin`, `/proposal/*`, `/invoice/*`.

---

## 1. Framework & app structure

### Behavior

- Public marketing pages are Astro `.astro` routes under `src/pages/`.
- Interactive pieces are React islands (`client:load` / `client:visible` / `client:idle`): nav, contact form, package finder, pricing compare, chat.
- Owner-editable content lives in `src/config/site.ts`, `packages.ts`, `faq.ts`.
- Insights use Astro content collections (`src/content.config.ts`); one draft post exists.
- SSR endpoints use `export const prerender = false` (`/api/*`, `/contact`, `/work`).
- Astro sessions are **intentionally disabled** (`sessionDrivers.lruCache()` in `astro.config.mjs`) to avoid Workers SESSION KV auto-provision failures.

### Implications for Studio OS

- Keep Astro + Cloudflare adapter; do **not** introduce Next.js.
- Studio OS can live as additional Astro routes/islands under the same Worker (or a second Worker hostname) while reusing `global.css` tokens and security helpers.
- Prefer server-rendered/admin API routes with `prerender = false` for authenticated surfaces.

---

## 2. Hosting & deployment

### Behavior

- Worker: `che-xu-studio-site` (`wrangler.jsonc`).
- Build: `astro build` → `scripts/prepare-cf-deploy.mjs` writes gitignored root `wrangler.json` with `main: ./dist/server/entry.mjs`.
- Deploy: `scripts/cf-deploy.mjs` (`npm run cf:deploy`) with `--x-provision=false`, `--keep-vars`, public var injection, secrets file upload.
- CI backup: `.github/workflows/deploy-worker.yml` on `main` / workflow_dispatch.
- Bindings: D1 `DB`, AI, rate limiters; `keep_vars: true`; observability enabled.
- Site URL default: `https://chexustudio.com` (`astro.config.mjs` `site`).

### Implications for Studio OS

- Prefer staying on Cloudflare Workers for the private app (routing via `studio.chexustudio.com` and/or `/admin`).
- New secrets (Supabase, Stripe, Browser Rendering) must follow existing secret handling (`runtime-secrets.mjs` / Workers Builds Encrypt / GitHub secrets) — never commit `.dev.vars`.
- Dual-hostname routing (apex marketing vs studio subdomain) should be designed in Phase 2 without breaking Workers Builds deploy wrappers.

---

## 3. Database (current)

### Behavior

- Single D1 table: `leads` (`migrations/0001_init.sql`).
- Insert helper: `src/lib/db.ts` → `insertLead`.
- Contact API returns **503** if `DB` binding missing; marketing site still deploys.
- D1 `database_id` is already a real UUID in `wrangler.jsonc` (not the placeholder).

### Implications for Studio OS

- **Keep D1 leads workflow intact** during initial Studio OS work.
- Studio OS business data → **Supabase Postgres** (per product brief), not D1 expansion for clients/projects/invoices.
- Later optional bridge: convert consented leads → Studio clients (Phase 6+), without coupling public contact storage to Supabase availability.

---

## 4. Authentication (current)

### Behavior

- **No administrator authentication.**
- No cookies/sessions for users; Astro session driver is LRU cache only (non-persistent, unused by app logic).
- Public APIs rely on origin checks + Turnstile + rate limits, not user identity.

### Implications for Studio OS

- Introduce **Supabase Auth** for admins (Phase 5).
- Need secure cookies, server-side session verification, and protected route middleware — new surface area; extend `src/middleware.ts` carefully so public marketing headers/caching remain correct.

---

## 5. CSS / design system

### Behavior

- Tokens in `src/styles/global.css` `@theme`:
  - Fonts: **Source Serif 4** (display), **DM Sans** (sans) — self-hosted woff2 in `public/fonts/`.
  - Colors: navy scale, brand blue, purple/green/gold service accents, surface/ink/border.
  - Radii, soft shadows, `container-shell`, button utilities, skip-link, `:focus-visible`.
  - `prefers-reduced-motion` respected globally.
- Layout shell: `BaseLayout.astro` (Header, Footer, MobileStickyCta, Chat).
- Brand assets: Wordmark + logo PNGs under `public/`.

### Implications for Studio OS

- Reuse tokens and typography; avoid a separate design system.
- Studio/admin should use a **dedicated layout** (no marketing chat sticky CTA / package CTAs) while sharing CSS variables.
- Public proposal/invoice pages should feel editorial/premium — same fonts/navy/brand blue, generous whitespace.

---

## 6. Forms & APIs

### Public APIs

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/contact` | POST | Lead capture → D1 + Resend notify |
| `/api/chat` | POST | Workers AI assistant |
| `/api/public-config` | GET | Non-secret Turnstile site key for client |

### Form / API patterns to reuse

1. `isAllowedOrigin(request, siteUrl)`
2. `enforceRateLimit(binding, key)`
3. `readJsonBody` with size cap
4. Zod `safeParse` + fieldErrors payload
5. Turnstile verification
6. Honeypot field (`website`) on contact
7. Soft-fail email after durable write
8. `redactForLogs` on error paths
9. Graceful 503 when bindings/secrets missing

Contact UI: `ContactForm.tsx` — accessible labels, field errors, Turnstile widget, mailto fallback when online delivery not configured.

Checkout placeholders: `/checkout/success`, `/checkout/cancelled` — `noindex`, explicitly state checkout is not enabled.

---

## 7. Security middleware & controls

### Present today

- Global middleware (`src/middleware.ts`): security headers + cache policy (`no-store` for `/api/*` and `/work`; short SWR elsewhere).
- Headers (`securityHeaders`): CSP, `X-Frame-Options: DENY`, COOP, HSTS (prod), Permissions-Policy, nosniff, Referrer-Policy.
- Origin allowlist for mutations.
- Rate limiting on contact/chat (fail-open if binding errors — documented tradeoff).
- Turnstile on contact (required) and chat (optional token).
- Body size limits; JSON content-type enforcement.
- Log redaction for PII-ish keys.
- Secrets via env/bindings only (`TURNSTILE_SECRET_KEY`, `RESEND_API_KEY`); `.gitignore` excludes `.dev.vars` / `.env`.

### Gaps relative to Studio OS requirements

| Requirement | Status |
| --- | --- |
| Admin auth + server authorization | Missing |
| Supabase RLS | N/A (no Supabase) |
| CSRF-safe mutation patterns for cookie auth | Missing (APIs today are origin+Turnstile, not cookie session) |
| Hashed public proposal/invoice tokens | Missing |
| Stripe webhook verification + idempotency | Missing |
| Audit logging table/events | Missing |
| Secure auth cookies | Missing |
| X-Robots-Tag for private token pages | Missing (meta robots exist via layout `noindex`) |

CSP today allows Turnstile + Cloudflare Insights; Studio OS will need controlled additions for Stripe.js / Supabase auth endpoints if used from the browser (prefer server-side Stripe Checkout redirect to minimize client secrets).

---

## 8. Email integration

### Behavior

- Resend via `fetch('https://api.resend.com/emails')`.
- Lead notification only; soft-fail; warns if key missing or `from` uses `resend.dev`.
- Env: `RESEND_API_KEY`, `CONTACT_FROM_EMAIL`, `CONTACT_NOTIFY_EMAIL`.
- **Does not** persist Resend message IDs / delivery state (no `email_logs` table).

### Implications for Studio OS

- Reuse Resend + verified domain pattern.
- Extend for Proposal Sent, Accepted, Invoice, Payment Received, Reminder templates.
- Add `email_logs` (Supabase) with provider message IDs — new concern beyond current notify helper.

---

## 9. SEO implementation

### Behavior

- `BaseLayout`: title template, description, canonical, robots meta, OG/Twitter, JSON-LD graph.
- `siteConfig.allowIndexing` currently **`false`** → site-wide noindex until launch decision.
- `robots.txt.ts`: Disallow all when indexing off; still emits Sitemap URL.
- `sitemap.xml.ts`: static marketing + portfolio routes only; **`lastmod` is `new Date().toISOString()` at build/request time** (not real content modification dates) — known inaccuracy called out in the master prompt.
- Checkout pages set `noindex={true}`.
- No `/admin`, `/proposal`, or `/invoice` routes in sitemap today (they do not exist).

### Implications for Studio OS

- Private routes must force `noindex, nofollow, noarchive` + `X-Robots-Tag`, and stay out of sitemap.
- Do not weaken public canonical/structured data when adding Studio layouts.
- Sitemap `lastmod` fix is a separate, small follow-up (omit or use real dates) — recommend bundling with Phase 2 route foundation or a tiny SEO hygiene commit, not mixed with schema work.

---

## 10. Testing setup

| Layer | Tool | Coverage today |
| --- | --- | --- |
| Unit | Vitest (`tests/unit`) | validation, security, SEO, notify-email, chat, packages, nav, public-config, runtime-secrets |
| E2E | Playwright (`tests/e2e`) | smoke marketing flows, navigation, axe on homepage; mobile/tablet/desktop projects |
| Typecheck | `astro check && tsc --noEmit` | |
| Lint | ESLint on `src` + `tests`, max-warnings 0 | |
| A11y | `@axe-core/playwright` | homepage serious/critical |

No tests yet for auth, payments, proposals, or RLS. Phase work should extend unit tests first; e2e for token pages and admin smoke later.

---

## 11. Deployment / secrets inventory

### Present env / bindings

| Name | Kind | Use |
| --- | --- | --- |
| `PUBLIC_SITE_URL` | public | Canonical / CORS |
| `PUBLIC_TURNSTILE_SITE_KEY` | public | Turnstile widget |
| `PUBLIC_CF_WEB_ANALYTICS_TOKEN` | public optional | Analytics |
| `TURNSTILE_SECRET_KEY` | secret | Siteverify |
| `RESEND_API_KEY` | secret | Email |
| `CONTACT_FROM_EMAIL` / `CONTACT_NOTIFY_EMAIL` | vars | Email from/to |
| `AI_MODEL` | var | Workers AI model |
| `DB` | D1 binding | Leads |
| `AI` | AI binding | Chat |
| `CONTACT_RATE_LIMITER` / `CHAT_RATE_LIMITER` | bindings | Abuse |

### Studio OS secrets to add later (do not commit)

- Supabase URL + anon key (public) / service role (server only)
- Stripe secret + webhook secret (server only)
- Browser Rendering / PDF credentials as required
- Possibly separate `PUBLIC_STUDIO_URL` for `studio.chexustudio.com`

---

## 12. What must remain intact

- Public marketing pages, components, package/FAQ/site config sources of truth.
- D1 lead insert + contact Turnstile + Resend notify path.
- Workers AI chat.
- Deploy wrappers (`prepare-cf-deploy`, `cf-deploy`) and SESSION KV avoidance.
- Existing security headers baseline (extend, don’t strip).
- Accessibility conventions (skip link, focus-visible, labels, reduced motion).

---

## Phase 2 recommendation — Architecture & route foundation

**Goal of Phase 2:** Document the target architecture and add **non-breaking route/layout scaffolding** only (stubs + SEO guards). No Supabase schema, no auth wiring, no Stripe yet (those are Phases 3–5 / 11).

### Recommended architecture

```
chexustudio.com          → existing Astro marketing Worker (unchanged default)
studio.chexustudio.com   → same Worker (host-based routing) OR path prefix /admin
                         → private Studio OS UI

/proposal/[token]        → public client proposal view/accept (token auth)
/invoice/[token]         → public client invoice view/pay (token auth)
/api/studio/*            → server mutations (admin + token-scoped public actions)
/api/stripe/webhook      → Stripe webhooks (signature + idempotency) [stub in Phase 2 optional]
```

**Data plane**

| Data | Store |
| --- | --- |
| Marketing leads | Cloudflare D1 (existing) |
| Studio OS entities | Supabase Postgres + RLS |
| Private PDFs | Supabase Storage (non-enumerable paths) |
| Auth | Supabase Auth (admins) |
| Payments | Stripe Checkout + webhooks |
| Email | Resend + `email_logs` |
| PDF render | Cloudflare Browser Rendering from shared HTML/print CSS |

**App structure (proposed for Phase 2 docs + stubs)**

```
docs/studio-os/
  ARCHITECTURE.md          # host routing, trust boundaries, workflow FSM
  SECURITY.md              # authz, tokens, CSRF, webhooks, RLS principles
  DATA-MODEL.md            # high-level entities (detailed DDL = Phase 4)

src/layouts/
  StudioLayout.astro       # noindex shell, no marketing chat/CTA
  DocumentLayout.astro     # proposal/invoice client document chrome

src/pages/
  admin/index.astro        # stub “sign in required” placeholder
  proposal/[token].astro   # stub token page + robots headers
  invoice/[token].astro    # stub token page + robots headers

src/middleware.ts          # extend: X-Robots-Tag for private paths; host awareness
```

### Phase 2 security decisions to lock in documentation

1. **Never** treat token URLs as secret-by-obscurity alone — store **SHA-256 (or better) hashes** of high-entropy tokens; compare hashes server-side.
2. Admin mutations: Supabase session cookie (httpOnly, Secure, SameSite) + origin/CSRF strategy documented before Phase 5 implementation.
3. Public token mutations (accept proposal, start checkout): Zod + rate limit + token hash lookup; no admin session required.
4. Stripe: webhook is source of truth for paid status; success page is informational only.
5. Sitemap/robots: exclude `/admin`, `/proposal`, `/invoice`, `/api/studio`, webhook paths; add `X-Robots-Tag: noindex, nofollow, noarchive`.
6. Keep CSP tight; plan Stripe Checkout as server-created redirect (minimal JS surface).

### Phase 2 files expected

| Action | File | Why |
| --- | --- | --- |
| Create | `docs/studio-os/ARCHITECTURE.md` | Host/routing/trust boundaries/workflow |
| Create | `docs/studio-os/SECURITY.md` | Controls checklist aligned to release blockers |
| Create | `docs/studio-os/DATA-MODEL.md` | Entity overview (DDL deferred to Phase 4) |
| Create | `src/layouts/StudioLayout.astro` | Private UI shell |
| Create | `src/layouts/DocumentLayout.astro` | Client proposal/invoice shell |
| Create | `src/pages/admin/index.astro` | Route foundation stub |
| Create | `src/pages/proposal/[token].astro` | Route foundation stub |
| Create | `src/pages/invoice/[token].astro` | Route foundation stub |
| Modify | `src/middleware.ts` | Private-path robots + cache `no-store` |
| Modify | `src/pages/sitemap.xml.ts` | Ensure private paths never listed; optionally fix `lastmod` |
| Modify | `src/pages/robots.txt.ts` | Disallow `/admin`, `/proposal`, `/invoice` when indexing enabled |
| Modify | `.dev.vars.example` | Comment placeholders for future Studio env vars (no secrets) |

### Explicitly out of Phase 2

- Supabase project/migrations/RLS
- Auth implementation
- CRUD for clients/projects
- Stripe / Resend Studio templates / PDF generation
- Changing public homepage or marketing components

### Migration / security implications of Phase 2

- Route stubs must not leak data (static “unavailable” / “invalid link” only).
- Adding `/admin` to a currently noindex site is low risk; still set explicit robots headers.
- Middleware changes must not alter caching or headers for public marketing paths incorrectly.
- No new npm dependencies required for Phase 2 scaffolding.

---

## Phase 1 completion checklist

- [x] Framework confirmed (Astro 7 + React 19 islands)
- [x] Hosting confirmed (Cloudflare Workers)
- [x] Database confirmed (D1 leads only)
- [x] Authentication confirmed (none for admins)
- [x] CSS/design system confirmed
- [x] Forms & APIs confirmed
- [x] Security middleware confirmed
- [x] Email integration confirmed (Resend leads)
- [x] SEO implementation confirmed (incl. inaccurate sitemap lastmod)
- [x] Testing setup confirmed
- [x] Deployment setup confirmed
- [x] Phase 2 architecture recommended
- [x] No production behavior mutated

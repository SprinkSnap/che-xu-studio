# Che Xu Studio Website

Premium, mobile-first marketing site for **Che Xu Studio** — high-converting web design, SEO strategy, and website care (CAD / `en-CA`).

Built with **Astro**, **React islands**, **Tailwind CSS**, and **Cloudflare Workers** (D1, Workers AI, Turnstile, Rate Limiting).

> Brand logo: `public/che-xu-studio-web-design-seo-logo.png`. Header/footer use `src/components/Wordmark.astro`.

> Online card checkout is **not** enabled yet (no Stripe account). Package CTAs route to `/contact` for quotes.

## Architecture overview

| Layer                     | Responsibility                                                       |
| ------------------------- | -------------------------------------------------------------------- |
| Astro pages               | Statically generated marketing routes, SEO metadata, structured data |
| React islands             | Package finder, contact form, chat, mobile nav, comparison           |
| `src/config/*`            | Owner-editable site, package, and FAQ source of truth                |
| `/api/*` Worker endpoints | Contact leads, AI chat (`import { env } from 'cloudflare:workers'`)  |
| Cloudflare D1             | Consented lead records (optional until `database_id` is set)         |
| Supabase Postgres (Studio)| Future Studio OS data/auth — see `docs/architecture/supabase.md`     |
| Workers AI                | Chat assistant grounded in package + FAQ data                        |
| Turnstile + rate limits   | Abuse protection on sensitive endpoints                              |

### Key routes

- `/` homepage
- `/services/web-design`, `/services/seo`, `/services/website-care`
- `/pricing`, `/about`, `/work`, `/contact`, `/insights`
- `/privacy`, `/terms`, `/refund-cancellation-policy`
- Custom `404`
- `/api/contact`, `/api/chat`
- `/admin` Studio OS shell (Phase 2+; gated by `STUDIO_OS_ENABLED` outside `astro dev`)
- `/api/studio/health` Studio config probe (no secrets)

## Data stores (intentional dual database)

| Store | Tooling | Purpose |
| --- | --- | --- |
| **Cloudflare D1** | `/migrations`, `npm run db:*` | Public contact leads (`/api/contact`) |
| **Supabase Postgres** | `/supabase/migrations`, `npm run supabase:*` | Studio OS (clients, projects, invoices, auth) — schema from Phase 4 |

Do **not** run D1 SQL through the Supabase CLI or Supabase SQL through Wrangler D1.  
Marketing pages must keep working when Supabase env vars are absent. Details: [`docs/architecture/supabase.md`](./docs/architecture/supabase.md).

## Local setup

```bash
npm install
cp .dev.vars.example .dev.vars
# Edit .dev.vars with Turnstile test keys and PUBLIC_SITE_URL
npm run db:migrate:local
npm run dev
```

Open `http://localhost:4321`.

Optional local Supabase (Docker required):

```bash
npm run supabase:start
npm run supabase:status   # copy URL + keys into .dev.vars
# npm run supabase:types  # after Phase 4 migrations exist
npm run supabase:stop
```

## Environment-variable reference

Copy from `.dev.vars.example`. Never commit `.dev.vars` or real secrets.

| Variable                        | Purpose                           |
| ------------------------------- | --------------------------------- |
| `PUBLIC_SITE_URL`               | Canonical origin for SEO and CORS |
| `PUBLIC_TURNSTILE_SITE_KEY`     | Turnstile site key (public)       |
| `TURNSTILE_SECRET_KEY`          | Turnstile secret (server)         |
| `AI_MODEL`                      | Workers AI model id               |
| `PUBLIC_CF_WEB_ANALYTICS_TOKEN` | Optional Cloudflare Web Analytics |
| `STUDIO_OS_ENABLED`             | Enable Studio surfaces outside `astro dev` |
| `STUDIO_BASE_URL`               | Studio origin for password-reset redirects (`https://studio.chexustudio.com`) |
| `PUBLIC_SUPABASE_URL`           | Studio Supabase URL (browser-safe) |
| `PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Studio publishable key (browser-safe) |
| `SUPABASE_SECRET_KEY`           | Studio secret key (**server only** — never `PUBLIC_`) |

Owner-editable non-secret content lives in:

- `src/config/site.ts` — business identity, contact placeholders, projects, testimonials
- `src/config/packages.ts` — package source of truth
- `src/config/faq.ts` — FAQ content

## Cloudflare Workers setup

1. Install Wrangler and authenticate: `npx wrangler login`
2. Update `wrangler.jsonc`:
   - `name`
   - D1 `database_id`
   - rate-limit namespace IDs if your account requires different values
3. Set secrets:

```bash
npx wrangler secret put TURNSTILE_SECRET_KEY
```

4. Set public vars in the Cloudflare dashboard or `[vars]` in Wrangler (do not put secrets there):

- `PUBLIC_SITE_URL`
- `PUBLIC_TURNSTILE_SITE_KEY`
- `AI_MODEL`
- optional `PUBLIC_CF_WEB_ANALYTICS_TOKEN`

### Deploy note (entrypoint + SESSION KV)

Cloudflare Workers Builds must use this repo’s deploy wrapper (not bare `wrangler deploy`).

This repo:

1. Keeps bindings in `wrangler.jsonc` (no package-export `main`)
2. Runs `scripts/prepare-cf-deploy.mjs` at the end of `npm run build`
3. Writes a gitignored root `wrangler.json` with `main: ./dist/server/entry.mjs`
4. Strips id-less KV bindings and disables Wrangler auto-provisioning on deploy

Use:

```bash
npm run build
npm run deploy:dry-run
# or
npm run deploy
```

**Cloudflare dashboard / Workers Builds settings (required):**

- **Build command:** `npm run build`
- **Deploy command:** `npm run cf:deploy`  
  (`node scripts/cf-deploy.mjs` — runs `wrangler deploy --config wrangler.json --x-provision=false`)
- Worker name should match `che-xu-studio-site`

Do **not** set Deploy command to bare `npx wrangler deploy`. That re-enables resource
auto-provisioning and can fail with API **10014** when `che-xu-studio-site-session`
(or similar) already exists from an earlier Astro SESSION KV auto-create.

### GitHub Actions deploy (backup when Workers Builds is stale)

If Workers Builds history does not list recent `main` commits (for example `4fb942c`)
but GitHub already has them, use the **Deploy Worker** workflow instead:

1. Create a Cloudflare API token with **Edit Cloudflare Workers** (include account
   resources for this account) and add repo secrets:
   - `CLOUDFLARE_API_TOKEN` (required) — paste the **secret token string** only  
     (no `Bearer `, no quotes, no token display name, no spaces/newlines)
   - `CLOUDFLARE_ACCOUNT_ID` (required)
   - optional: `TURNSTILE_SECRET_KEY`, `RESEND_API_KEY`
2. Optional repo **Variables**: `PUBLIC_SITE_URL`, `PUBLIC_TURNSTILE_SITE_KEY`,
   `CONTACT_FROM_EMAIL`
3. GitHub → **Actions** → **Deploy Worker** → **Run workflow** (branch `main`)

If deploy fails with Authorization header `6111` / auth `9106`, recreate the API
token and update `CLOUDFLARE_API_TOKEN` — the secret value is malformed or is the
token name instead of the secret.

Verify after deploy: `/work` should show the NorthLine HOME SERVICES portfolio card (not the empty
placeholder). Confirm file content on GitHub:
`https://github.com/SprinkSnap/che-xu-studio/blob/main/src/config/site.ts`

### Sessions / KV note

This site does **not** use Astro sessions. Config sets `sessionDrivers.lruCache()` so
`@astrojs/cloudflare` does not emit a `SESSION` KV binding. `prepare-cf-deploy.mjs`
also strips any id-less KV entries, and `cf:deploy` passes `--x-provision=false`.

Optional one-time cleanup in the Cloudflare dashboard: delete the unused
`che-xu-studio-site-session` KV namespace if it exists (safe — this site does not use it).

If you later need Astro sessions, add the existing KV namespace id under `kv_namespaces`
in `wrangler.jsonc` (do not leave `id` blank) and switch the session driver back to
`sessionDrivers.cloudflareKVBinding({ binding: 'SESSION' })`.

### D1 creation and migrations (optional for first deploy)

Workers Builds **succeeds without D1**. While `database_id` is still the placeholder
`00000000-0000-0000-0000-000000000000`, `prepare-cf-deploy.mjs` omits the `DB` binding
so Cloudflare does not reject the deploy. Marketing pages go live; contact lead storage
returns **503** until D1 is wired.

On a machine logged into the Cloudflare account that owns `che-xu-studio-site`:

```bash
npx wrangler login
npm run db:create          # creates che-xu-studio-db and writes database_id into wrangler.jsonc
npm run db:migrate:remote  # applies migrations/0001_init.sql (--config wrangler.jsonc)
git add wrangler.jsonc && git commit -m "Add production D1 database id" && git push
```

Manual alternative:

```bash
npx wrangler d1 create che-xu-studio-db
# paste the returned database_id into wrangler.jsonc
npm run db:migrate:remote
```

API endpoints already degrade without Cloudflare resources:

| Endpoint       | Without resource    |
| -------------- | ------------------- |
| `/api/contact` | 503 if `DB` missing |
| `/api/chat`    | 503 if `AI` missing |

Package CTAs use `/contact?plan=…&intent=quote` (no online card checkout yet).

### Workers AI binding

The `ai.binding = "AI"` entry in `wrangler.jsonc` enables Workers AI. Ensure the account has Workers AI access. Default model: `@cf/meta/llama-3.1-8b-instruct-fast` (override with `AI_MODEL`). Do not set `AI_MODEL` to the deprecated `@cf/meta/llama-3.1-8b-instruct`.

### Rate-limiter setup

`CHAT_RATE_LIMITER` and `CONTACT_RATE_LIMITER` are declared under `ratelimits` in `wrangler.jsonc`. Adjust `namespace_id`, `limit`, and `period` per account needs.

### Turnstile setup (required for online contact form)

Without these, `/contact` shows “Online form delivery is not fully configured yet” and falls back to mailto.

1. Cloudflare Dashboard → **Turnstile** → **Add widget** (Managed mode)
   - Domains: `chexustudio.com` (and your `*.workers.dev` preview host if needed)
2. Copy the **Site Key** and **Secret Key**
3. Confirm Workers Builds **Deploy command** is `npm run cf:deploy` (not bare `npx wrangler deploy`)
4. **Workers Builds** → **Settings** → **Variables**
   - Plain variable: `PUBLIC_TURNSTILE_SITE_KEY` = site key
   - Plain variable: `PUBLIC_SITE_URL` = `https://chexustudio.com`
   - **Encrypt secret:** `TURNSTILE_SECRET_KEY` = secret key  
     Use type **Secret / Encrypt**, not a plain Variable. Plain Variables can be wiped on deploy.
5. Retry deployment. Deploy logs should include:
   - `Injected wrangler vars: PUBLIC_TURNSTILE_SITE_KEY, ...`
   - `Uploading runtime secrets: TURNSTILE_SECRET_KEY`
6. Confirm: `https://che-xu-studio-site.<account>.workers.dev/api/public-config` returns a non-empty `turnstileSiteKey`
7. Optional but recommended for saving leads: create D1 (`npm run db:create` + migrate) and commit the real `database_id`

Notes:

- `npm run cf:deploy` uses `--keep-vars`, sets `keep_vars: true`, injects PUBLIC_* into `wrangler.json`, and re-uploads Builds secrets via `--secrets-file`.
- Do **not** store `TURNSTILE_SECRET_KEY` as a plain Worker Variable. If the dashboard offers Type, choose **Secret**.

Local test keys from Cloudflare docs are listed in `.dev.vars.example`.

### Contact email notifications (Resend)

Successful form submissions are saved in D1 and also emailed to `info@chexustudio.com` when Resend is configured.

The form can show success even when email fails (lead is still in D1). If inbox alerts are missing, check Resend **Emails** / **Logs** first.

1. Create a free account at [resend.com](https://resend.com) and add an API key (**Sending access**)
2. Resend → **Domains** → add `chexustudio.com` (or `send.chexustudio.com`) → add DNS → status **Verified**
3. **Workers Builds** → **Settings** → **Variables**
   - **Encrypt secret:** `RESEND_API_KEY`
   - Plain variable: `CONTACT_FROM_EMAIL` = `Che Xu Studio <info@chexustudio.com>`  
     The address domain **must match** the verified Resend domain.  
     If you verified `send.chexustudio.com`, use e.g. `Che Xu Studio <notify@send.chexustudio.com>`.
   - Optional plain: `CONTACT_NOTIFY_EMAIL` = `info@chexustudio.com`
4. Redeploy (logs should show `Uploading runtime secrets: ... RESEND_API_KEY` and injected `CONTACT_FROM_EMAIL`)
5. Submit a test contact → Resend dashboard should show a delivery (or a clear 403/error)
6. Check the Microsoft 365 / Outlook inbox for `info@chexustudio.com` (and spam)

Common failures:

| Symptom | Cause |
| --- | --- |
| No email, form OK | `RESEND_API_KEY` missing on Worker (add Builds Encrypt secret + redeploy) |
| Resend 403 / only own email | `from` still `*@resend.dev` or domain not verified — set `CONTACT_FROM_EMAIL` |
| Resend 403 domain mismatch | Verified `send.…` but From is `@chexustudio.com` (or the reverse) |
| Resend delivered, inbox empty | `info@` mailbox missing/misconfigured in Microsoft 365 |

Until `RESEND_API_KEY` is set, leads still save in D1; only the inbox email is skipped.

## Development and test commands

```bash
npm run dev
npm run test
npm run lint
npm run typecheck
npm run format:check
npm run build
npm run preview
npm run test:e2e          # requires build + Playwright browsers
npm run deploy:dry-run    # build + wrangler deploy --dry-run
```

Install Playwright browsers once:

```bash
npx playwright install chromium
```

## Local quote / contact test

1. Run `npm run build && npm run preview` (or `npm run dev`).
2. Open `/pricing` and choose **Get a quote** / **Request this plan** on a package.
3. Confirm you land on `/contact` with the package pre-selected and a quote intent message.
4. Submit the contact form with Turnstile test keys and confirm success (needs D1 for persistence).

## Local Workers AI chat test (exact steps)

1. Ensure the Cloudflare account has Workers AI enabled and `npx wrangler login` has been completed.
2. Set `AI_MODEL=@cf/meta/llama-3.1-8b-instruct-fast` (or another supported instruction model) in `.dev.vars`.
3. Run `npm run preview` (AI binding uses remote Workers AI).
4. Open the site, click **Chat with AI**, accept the privacy note, try a quick reply such as “How much does a website cost?”
5. Confirm the assistant identifies as the Che Xu Studio AI assistant and quotes CAD package data without inventing discounts or rankings.
6. Stop the AI binding or use an invalid model to confirm the UI falls back to the contact form path.

## Production launch checklist

See [`LAUNCH_CHECKLIST.md`](./LAUNCH_CHECKLIST.md).

### DNS / custom domain (do not execute here)

1. In Cloudflare, add the custom domain to the Worker/Pages project.
2. Create DNS records as prompted (proxied orange-cloud recommended).
3. Confirm TLS is active.
4. Set `PUBLIC_SITE_URL` to the production origin.
5. Set `siteConfig.allowIndexing = true` only when ready to index.

## Owner review still required

Before launch, the business owner (or qualified legal counsel) must supply/review:

- Verified email, phone, booking URL, address, social profiles (`src/config/site.ts`)
- Optional SVG/vector version of the logo (PNG lockups are already wired in header/footer)
- Legal text on Privacy, Terms, and Refund/Cancellation pages
- Whether `allowIndexing` should be enabled
- Any verified testimonials, logos, case studies, or metrics (otherwise leave arrays empty)
- Retention periods for leads
- Whether/when to add online card checkout later

## Design notes

Visual language: deep navy, electric blue, purple (custom web), green (SEO), gold (care). Design tokens live in `src/styles/global.css`. Motion respects `prefers-reduced-motion`.

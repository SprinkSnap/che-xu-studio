# Che Xu Studio Website

Premium, mobile-first marketing site for **Che Xu Studio** — high-converting web design, SEO strategy, and website care (CAD / `en-CA`).

Built with **Astro**, **React islands**, **Tailwind CSS**, and **Cloudflare Workers** (D1, Workers AI, Turnstile, Rate Limiting).

> Temporary accessible CSS wordmark is used in the header/footer. Replace with a vector logo when available (`src/components/Wordmark.astro`).

> Online card checkout is **not** enabled yet (no Stripe account). Package CTAs route to `/contact` for quotes.

## Architecture overview

| Layer                     | Responsibility                                                       |
| ------------------------- | -------------------------------------------------------------------- |
| Astro pages               | Statically generated marketing routes, SEO metadata, structured data |
| React islands             | Package finder, contact form, chat, mobile nav, comparison           |
| `src/config/*`            | Owner-editable site, package, and FAQ source of truth                |
| `/api/*` Worker endpoints | Contact leads, AI chat (`import { env } from 'cloudflare:workers'`)  |
| Cloudflare D1             | Consented lead records (optional until `database_id` is set)         |
| Workers AI                | Chat assistant grounded in package + FAQ data                        |
| Turnstile + rate limits   | Abuse protection on sensitive endpoints                              |

### Key routes

- `/` homepage
- `/services/web-design`, `/services/seo`, `/services/website-care`
- `/pricing`, `/about`, `/work`, `/contact`, `/insights`
- `/privacy`, `/terms`, `/refund-cancellation-policy`
- Custom `404`
- `/api/contact`, `/api/chat`

## Local setup

```bash
npm install
cp .dev.vars.example .dev.vars
# Edit .dev.vars with Turnstile test keys and PUBLIC_SITE_URL
npm run db:migrate:local
npm run dev
```

Open `http://localhost:4321`.

## Environment-variable reference

Copy from `.dev.vars.example`. Never commit `.dev.vars` or real secrets.

| Variable                        | Purpose                           |
| ------------------------------- | --------------------------------- |
| `PUBLIC_SITE_URL`               | Canonical origin for SEO and CORS |
| `PUBLIC_TURNSTILE_SITE_KEY`     | Turnstile site key (public)       |
| `TURNSTILE_SECRET_KEY`          | Turnstile secret (server)         |
| `AI_MODEL`                      | Workers AI model id               |
| `PUBLIC_CF_WEB_ANALYTICS_TOKEN` | Optional Cloudflare Web Analytics |

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

The `ai.binding = "AI"` entry in `wrangler.jsonc` enables Workers AI. Ensure the account has Workers AI access. Default model: `@cf/meta/llama-3.1-8b-instruct` (override with `AI_MODEL`).

### Rate-limiter setup

`CHAT_RATE_LIMITER` and `CONTACT_RATE_LIMITER` are declared under `ratelimits` in `wrangler.jsonc`. Adjust `namespace_id`, `limit`, and `period` per account needs.

### Turnstile setup

1. Create a widget in Cloudflare Turnstile.
2. Put the site key in `PUBLIC_TURNSTILE_SITE_KEY`.
3. Put the secret in `TURNSTILE_SECRET_KEY`.
4. Local test keys from Cloudflare docs are listed in `.dev.vars.example`.

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
2. Set `AI_MODEL=@cf/meta/llama-3.1-8b-instruct` (or another supported instruction model) in `.dev.vars`.
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
- Vector logo asset
- Legal text on Privacy, Terms, and Refund/Cancellation pages
- Whether `allowIndexing` should be enabled
- Any verified testimonials, logos, case studies, or metrics (otherwise leave arrays empty)
- Retention periods for leads
- Whether/when to add online card checkout later

## Design notes

Visual language: deep navy, electric blue, purple (custom web), green (SEO), gold (care). Design tokens live in `src/styles/global.css`. Motion respects `prefers-reduced-motion`.

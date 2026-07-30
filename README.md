# Che Xu Studio Website

Premium, mobile-first marketing site for **Che Xu Studio** — high-converting web design, SEO strategy, and website care (CAD / `en-CA`).

Built with **Astro**, **React islands**, **Tailwind CSS**, and **Cloudflare Workers** (D1, Workers AI, Turnstile, Rate Limiting, Stripe Checkout).

> Temporary accessible CSS wordmark is used in the header/footer. Replace with a vector logo when available (`src/components/Wordmark.astro`).

## Architecture overview

| Layer | Responsibility |
| --- | --- |
| Astro pages | Statically generated marketing routes, SEO metadata, structured data |
| React islands | Package finder, checkout drawer, contact form, chat, mobile nav, comparison |
| `src/config/*` | Owner-editable site, package, and FAQ source of truth |
| `/api/*` Worker endpoints | Checkout, contact leads, AI chat, Stripe webhooks (`import { env } from 'cloudflare:workers'`) |
| Cloudflare D1 | Consented leads + verified order / event records |
| Stripe Checkout | Card/wallet payments; no raw card data on this app |
| Workers AI | Chat assistant grounded in package + FAQ data |
| Turnstile + rate limits | Abuse protection on sensitive endpoints |

### Key routes

- `/` homepage
- `/services/web-design`, `/services/seo`, `/services/website-care`
- `/pricing`, `/about`, `/work`, `/contact`, `/insights`
- `/checkout/success`, `/checkout/cancelled`
- `/privacy`, `/terms`, `/refund-cancellation-policy`
- Custom `404`
- `/api/checkout`, `/api/contact`, `/api/chat`, `/api/webhooks/stripe`

## Local setup

```bash
npm install
cp .dev.vars.example .dev.vars
# Edit .dev.vars with Stripe test keys, Turnstile test keys, and PUBLIC_SITE_URL
npm run db:migrate:local
npm run dev
```

Open `http://localhost:4321`.

## Environment-variable reference

Copy from `.dev.vars.example`. Never commit `.dev.vars` or real secrets.

| Variable | Purpose |
| --- | --- |
| `PUBLIC_SITE_URL` | Canonical origin for SEO, CORS, Stripe redirects |
| `PUBLIC_TURNSTILE_SITE_KEY` | Turnstile site key (public) |
| `TURNSTILE_SECRET_KEY` | Turnstile secret (server) |
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `STRIPE_PRICE_*` | Allowlisted Price IDs mapped server-side only |
| `STRIPE_PRICE_PROJECT_DEPOSIT` | Optional deposit price for starting-at projects |
| `AI_MODEL` | Workers AI model id |
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
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_WEBHOOK_SECRET
# optional price IDs as secrets or vars
npx wrangler secret put STRIPE_PRICE_SEO_GROWTH
npx wrangler secret put STRIPE_PRICE_WEBSITE_CARE
```

4. Set public vars in the Cloudflare dashboard or `[vars]` in Wrangler (do not put secrets there):

- `PUBLIC_SITE_URL`
- `PUBLIC_TURNSTILE_SITE_KEY`
- `AI_MODEL`
- optional `PUBLIC_CF_WEB_ANALYTICS_TOKEN`

### Deploy note (entrypoint)

Cloudflare Workers Builds often runs `npx wrangler deploy` after `npm run build` **without** Astro’s `.wrangler` redirect. Wrangler also cannot resolve the package-export string `@astrojs/cloudflare/entrypoints/server` as a filesystem path.

This repo therefore:

1. Keeps bindings in `wrangler.jsonc` (no package-export `main`)
2. Runs `scripts/prepare-cf-deploy.mjs` at the end of `npm run build`
3. Writes a gitignored root `wrangler.json` with `main: ./dist/server/entry.mjs`

Use:

```bash
npm run build
npx wrangler deploy --dry-run
# or
npm run deploy
```

Cloudflare dashboard / Workers Builds settings:

- **Build command:** `npm run build`
- **Deploy command:** `npx wrangler deploy`
- Worker name should match `che-xu-studio-site`

### D1 creation and migrations

The deploy will fail while `database_id` is still the placeholder
`00000000-0000-0000-0000-000000000000`.

On a machine logged into the Cloudflare account that owns `che-xu-studio-site`:

```bash
npx wrangler login
npm run db:create          # creates che-xu-studio-db and writes database_id into wrangler.jsonc
npm run db:migrate:remote  # applies migrations/0001_init.sql
git add wrangler.jsonc && git commit -m "Add production D1 database id" && git push
```

Manual alternative:

```bash
npx wrangler d1 create che-xu-studio-db
# paste the returned database_id into wrangler.jsonc
npm run db:migrate:remote
```

### Workers AI binding

The `ai.binding = "AI"` entry in `wrangler.jsonc` enables Workers AI. Ensure the account has Workers AI access. Default model: `@cf/meta/llama-3.1-8b-instruct` (override with `AI_MODEL`).

### Rate-limiter setup

`CHAT_RATE_LIMITER`, `CONTACT_RATE_LIMITER`, and `CHECKOUT_RATE_LIMITER` are declared under `ratelimits` in `wrangler.jsonc`. Adjust `namespace_id`, `limit`, and `period` per account needs.

### Turnstile setup

1. Create a widget in Cloudflare Turnstile.
2. Put the site key in `PUBLIC_TURNSTILE_SITE_KEY`.
3. Put the secret in `TURNSTILE_SECRET_KEY`.
4. Local test keys from Cloudflare docs are listed in `.dev.vars.example`.

## Stripe setup

1. Create Products/Prices in Stripe **test mode** for:
   - SEO Growth (recurring)
   - Website Care (recurring)
   - Optional fixed project prices / deposit
2. Copy Price IDs into env vars (`STRIPE_PRICE_*`).
3. For starting-at project packages **without** a fixed Price ID, checkout returns `422 quoteRequired` and the UI routes to `/contact` for an exact quote.
4. Webhook endpoint: `https://YOUR_DOMAIN/api/webhooks/stripe`
   - Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`
5. Local webhook testing:

```bash
stripe listen --forward-to localhost:4321/api/webhooks/stripe
# put the printed whsec_… into .dev.vars as STRIPE_WEBHOOK_SECRET
```

Checkout never accepts prices, modes, or Price IDs from the browser—only an internal `planId` allowlist.

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

## Local Stripe test (exact steps)

1. Create Stripe test Products/Prices for at least SEO Growth and Website Care.
2. Put `STRIPE_SECRET_KEY` and Price IDs into `.dev.vars`.
3. Run `npm run db:migrate:local && npm run build && npm run preview`.
4. In another terminal: `stripe listen --forward-to localhost:4321/api/webhooks/stripe` and copy `whsec_…` into `.dev.vars`, then restart preview.
5. Open `/pricing`, start Website Care checkout, complete with Stripe test card `4242 4242 4242 4242`.
6. Confirm `/checkout/success` verifies the session and the webhook writes/updates the D1 order.
7. Retry a manipulated client payload (`price` / `stripePriceId` in JSON) and confirm `/api/checkout` rejects it.

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
6. Point Stripe webhook to the production `/api/webhooks/stripe` endpoint with live secrets only after explicit authorization.

## Owner review still required

Before launch, the business owner (or qualified legal counsel) must supply/review:

- Verified email, phone, booking URL, address, social profiles (`src/config/site.ts`)
- Vector logo asset
- Stripe live Price IDs and deposit policy
- Legal text on Privacy, Terms, and Refund/Cancellation pages
- Whether `allowIndexing` should be enabled
- Any verified testimonials, logos, case studies, or metrics (otherwise leave arrays empty)
- Retention periods for leads/orders

## Design notes

Visual language: deep navy, electric blue, purple (custom web), green (SEO), gold (care). Design tokens live in `src/styles/global.css`. Motion respects `prefers-reduced-motion`.

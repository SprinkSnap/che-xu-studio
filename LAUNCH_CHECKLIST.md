# Launch checklist — Che Xu Studio

Use this before any production DNS cutover or live Stripe charges. Do **not** deploy paid resources without explicit authorization.

## Content & brand

- [ ] Replace temporary CSS wordmark with a vector logo
- [ ] Fill verified email / phone / booking URL / address / socials in `src/config/site.ts`
- [ ] Add only verified projects and testimonials (or leave empty)
- [ ] Confirm all five package prices and inclusions still match business offers
- [ ] Set `allowIndexing` to `true` only when the site should be indexed
- [ ] Review homepage, service, pricing, and FAQ copy for accuracy

## Legal

- [ ] Have an authorized owner or qualified legal professional review:
  - `/privacy`
  - `/terms`
  - `/refund-cancellation-policy`
- [ ] Confirm cancellation notice periods and deposit/refund rules
- [ ] Confirm retention periods for leads and orders

## Cloudflare

- [ ] Create D1 database and paste real `database_id` into `wrangler.jsonc`
- [ ] Run remote D1 migrations
- [ ] Confirm Workers AI enabled for the account
- [ ] Confirm rate-limit bindings / namespace IDs
- [ ] Create production Turnstile keys and set secrets/vars
- [ ] Set `PUBLIC_SITE_URL` to the production origin
- [ ] Optional: Cloudflare Web Analytics token
- [ ] Run `npm run deploy:dry-run` successfully
- [ ] Deploy only with explicit authorization
- [ ] Attach custom domain / DNS (proxied) without guessing records

## Stripe

- [ ] Create test products/prices and verify checkout end-to-end
- [ ] Configure webhook in test mode; verify signature + idempotency
- [ ] Decide which project packages use fixed Price IDs vs quote-only vs deposit
- [ ] Create live mode products/prices only when authorized
- [ ] Configure live webhook endpoint and `STRIPE_WEBHOOK_SECRET`
- [ ] Confirm wallets / payment methods in Stripe Dashboard settings

## Security & quality

- [ ] `npm run test` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` passes
- [ ] `npm run deploy:dry-run` passes
- [ ] Spot-check mobile widths: 360, 390, 768, 1024, 1440
- [ ] Keyboard-test nav, package finder, checkout drawer, chat, contact form
- [ ] Confirm no secrets in client bundles or git history
- [ ] Confirm CSP still allows Stripe + Turnstile after any script changes

## Go-live

- [ ] Explicit authorization to deploy and point DNS
- [ ] Explicit authorization for live Stripe charges
- [ ] Monitor first contact submissions and a test live/small transaction if authorized
- [ ] Submit sitemap in Search Console after indexing is enabled

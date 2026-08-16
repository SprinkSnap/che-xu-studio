# Launch checklist — Che Xu Studio

Use this before any production DNS cutover. Do **not** deploy paid resources without explicit authorization.

## Content & brand

- [x] Replace temporary CSS wordmark with the Che Xu Studio logo asset
- [ ] Fill verified email / phone / booking URL / address / socials in `src/config/site.ts`
- [ ] Add only verified projects and testimonials (or leave empty)
- [ ] Confirm all five package prices and inclusions still match business offers
- [x] Set `allowIndexing` to `true` only when the site should be indexed
- [ ] Review homepage, service, pricing, and FAQ copy for accuracy

## Legal

- [ ] Have an authorized owner or qualified legal professional review:
  - `/privacy`
  - `/terms`
  - `/refund-cancellation-policy`
- [ ] Confirm cancellation notice periods and deposit/refund rules
- [ ] Confirm retention periods for leads

## Cloudflare

- [ ] First marketing deploy can proceed **without** D1 (placeholder `database_id` is omitted automatically)
- [ ] Before enabling contact lead persistence: create D1 and commit real `database_id`
  - Run `npx wrangler login && npm run db:create && npm run db:migrate:remote`
  - Commit the updated `database_id`, then redeploy
- [ ] Confirm Workers AI enabled for the account (chat returns 503 without `AI`)
- [ ] Confirm rate-limit bindings / namespace IDs
- [ ] Create production Turnstile keys and set secrets/vars
- [ ] Set `PUBLIC_SITE_URL` to the production origin
- [ ] Optional: Cloudflare Web Analytics token
- [ ] Run `npm run deploy:dry-run` successfully
- [ ] Deploy only with explicit authorization (`npm run deploy`, which builds then uses `dist/server/wrangler.json`)
- [ ] Attach custom domain / DNS (proxied) without guessing records
- [ ] If using Cloudflare Workers Builds: build command `npm run build`, deploy command **`npm run cf:deploy`** (not bare `npx wrangler deploy`)
- [ ] Confirm Worker name is `che-xu-studio-site` (matches wrangler.jsonc)
- [ ] Confirm deploy config has no id-less KV bindings (session driver is null; `cf:deploy` uses `--x-provision=false`)
- [ ] Optional: delete unused `che-xu-studio-site-session` KV namespace in the Cloudflare dashboard

## Payments

- [ ] Online card checkout is intentionally **not** enabled yet
- [ ] Confirm package CTAs route to `/contact?plan=…&intent=quote`
- [ ] Confirm invoice / payment process used offline until a processor is added later

## Security & quality

- [ ] `npm run test` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` passes
- [ ] `npm run deploy:dry-run` passes
- [ ] Spot-check mobile widths: 360, 390, 768, 1024, 1440
- [ ] Keyboard-test nav, package finder, chat, contact form
- [ ] Confirm no secrets in client bundles or git history
- [ ] Confirm CSP still allows Turnstile after any script changes

## Go-live

- [ ] Explicit authorization to deploy and point DNS
- [ ] Monitor first contact submissions
- [ ] Submit sitemap in Search Console after indexing is enabled

# Production checklist

Separate **code-verifiable** items from **external configuration** that humans must confirm in vendor dashboards.

## Code-verifiable

Run from repo root after applying migrations locally:

```bash
npm run typecheck
npm run lint
npm run test
npm run test:security
npm run check:launch
npm run check:supabase-secret-leak
npm run supabase:db:test   # clean Postgres apply + adversarial RLS
npm run build
npm run test:e2e
```

Confirm:

- [ ] All commands above exit 0
- [ ] `supabase/config.toml` has `enable_signup = false`
- [ ] Private routes absent from sitemap (`/admin`, `/proposal`, `/invoice`, `/api`)
- [ ] `.dev.vars.example` contains placeholders only
- [ ] No `STRIPE_SECRET_KEY` / `SUPABASE_SECRET_KEY` / `RESEND_API_KEY` in tracked source
- [ ] Launch gate document reviewed: `docs/operations/launch-gate.md`

## External configuration (manual — do not mark complete without verification)

### Supabase

- [ ] Production project created (separate from local/dev)
- [ ] All migrations applied cleanly (`202608140001` … `018`)
- [ ] Auth: **Allow new users to sign up = OFF**
- [ ] Auth password policy ≥ 12 characters
- [ ] First owner bootstrapped; bootstrap script disabled/restricted after use
- [ ] PITR / backups enabled; retention noted; restore owner assigned
- [ ] Storage bucket `studio-documents` private; policies deny anon list/get
- [ ] No fictional seed clients/payments in production

### Stripe

- [ ] Live mode keys only in production Worker secrets
- [ ] Publishable + secret both `*_live_*` (no mixed test/live)
- [ ] Webhook endpoint `https://<studio-host>/api/webhooks/stripe`
- [ ] Events: checkout.session.*, payment_intent.payment_failed, charge.refunded, refund.updated
- [ ] Signing secret stored as `STRIPE_WEBHOOK_SECRET`
- [ ] Business / payment method settings complete

### Resend

- [ ] Domain verified
- [ ] `STUDIO_FROM_EMAIL` / `STUDIO_NOTIFY_EMAIL` use verified domain
- [ ] Click tracking does **not** rewrite capability URLs (or tracking disabled for those templates)
- [ ] No production email test override env set

### Cloudflare

- [ ] Custom domains + DNS for marketing and Studio
- [ ] Worker secrets encrypted (never plain vars for secrets)
- [ ] `STUDIO_OS_ENABLED=true` only after staging smoke
- [ ] Rate limit bindings present (chat, contact, auth, checkout, capability)
- [ ] Cron → `POST /api/studio/jobs/process` with `Authorization: Bearer <CRON_SECRET>`
- [ ] `BROWSER` binding for PDF rendering
- [ ] Observability / log push reviewed (no token logging)

### Legal / billing identity

- [ ] Legal business name, billing address, tax ID (if required) configured in Studio settings
- [ ] Proposal/invoice terms reviewed by owner (not invented by engineering)
- [ ] Tax defaults deliberate — no silent unverified fallback for real invoices

## Secret checklist

Never commit:

- `SUPABASE_SECRET_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `RESEND_API_KEY`
- `CRON_SECRET`
- `TURNSTILE_SECRET_KEY`

Store via Cloudflare encrypted secrets / Supabase dashboard. Rotate if ever exposed in logs or chat.

# Studio OS runbook

Practical operations for Che Xu Studio on Cloudflare Workers + Supabase.

Related: [production-checklist.md](./production-checklist.md) · [recovery.md](./recovery.md) · [production-rollout.md](./production-rollout.md) · [launch-record.md](./launch-record.md)

---

## How do I log into Studio?

1. Open `STUDIO_BASE_URL` (preferred `https://studio.chexustudio.com/admin/login`, or `https://chexustudio.com/admin/login` if that is the configured host).
2. Sign in with an **active** Owner/Admin/Staff profile linked in `profiles`.
3. A valid Supabase Auth user **without** an active Studio profile must land on access-denied — not the dashboard.

If login loops: check `STUDIO_BASE_URL`, Auth redirect allow-list, and cookie host (host-only; no shared apex Domain).

---

## How do I create the first / another staff user?

1. **First Owner:** follow `docs/architecture/studio-auth.md` + `scripts/bootstrap-studio-owner.mjs` (service role). Do not commit passwords.
2. **Additional users:** create Auth user in Supabase Dashboard (invite) **or** admin API; insert `profiles` row with `role` + `status=active` as an existing Admin/Owner (RLS blocks self-enrollment).
3. Confirm **Auth → Allow new users to sign up = OFF** in production.

---

## How do I rotate secrets?

Never commit values. Prefer Cloudflare **encrypted secrets** (`secret_text`), not plain Worker vars.

| Secret | Steps |
|--------|--------|
| `SUPABASE_SECRET_KEY` | Rotate in Supabase → `npx wrangler secret put SUPABASE_SECRET_KEY` → remove any plain_text duplicate → redeploy/restart as needed → verify Studio login + service jobs |
| `STRIPE_SECRET_KEY` | Rotate in Stripe → update Worker secret → confirm mode matches publishable key (`sk_live_`/`pk_live_`) |
| `STRIPE_WEBHOOK_SECRET` | Create/rotate webhook endpoint signing secret → `wrangler secret put STRIPE_WEBHOOK_SECRET` → send Stripe test event |
| `RESEND_API_KEY` | Rotate in Resend → encrypted Worker secret → send internal test mail |
| `TURNSTILE_SECRET_KEY` | Rotate in Turnstile → encrypted secret → contact form smoke |
| `CRON_SECRET` | Generate long random → encrypted secret → update Cron `Authorization: Bearer …` |

After any rotation: watch Cloudflare logs + Stripe/Resend dashboards for 15–30 minutes.

---

## How do I revoke a Proposal/Invoice link?

Admin → Proposal or Invoice → revoke public link → generate replacement → resend email.  
Immutable document content stays the same. Old token must 404/unavailable.

---

## Stripe payment succeeded but Studio Invoice unpaid

1. Stripe Dashboard → Payment / Checkout Session → note `pi_…` / `cs_…` / event id.  
2. Inspect `webhook_events` for that provider event id and `processing_status`.  
3. Check Cloudflare logs for signature/handler errors (no raw bodies in tickets).  
4. Stripe → Resend event if missing.  
5. If still missing: service-role controlled reconcile via `apply_succeeded_stripe_payment` with **exact** Stripe amount/currency/ids (see [recovery.md](./recovery.md)).  
6. Confirm one `payments` row, Invoice balance, Project transition once.  
**Never** “force mark paid” in the UI without provider evidence.

---

## Email failed

1. Confirm recipient + `STUDIO_FROM_EMAIL` domain verified.  
2. Inspect `email_logs` / `email_outbox` status.  
3. Fix config/address.  
4. Retry idempotently (Admin retry or Cron outbox).  
5. Domain truth (sent/accepted/paid) must not roll back because mail failed.

**Emergency outbound stop:** disable Cloudflare Cron trigger for `/api/studio/jobs/process`, and/or unset/rotate `CRON_SECRET` so jobs 404. (No separate `EMAIL_SENDING_ENABLED` flag in code today.)

---

## Reminder failure

- Per-invoice: disable `payment_reminders_enabled` on the Invoice.  
- Global: Cron off / `CRON_SECRET` invalid; or adjust `settings` reminder columns.  
- After paid: reminders must not send — verify balance/status before re-enabling Cron.

---

## PDF generation failed

1. Confirm Worker has `BROWSER` binding.  
2. Inspect `documents` / `document_jobs` status.  
3. Retry Admin PDF action.  
4. Confirm private `studio-documents` Storage.  
5. HTML Proposal/Invoice pages remain valid without PDF.

**Emergency:** leave PDF failing; do not ship empty/fake PDFs. Fix binding or disable UI affordances until restored.

---

## Capability link compromised

Revoke → new link → resend. No document rewrite. Notify client if needed.

---

## Void Invoice / archive Client or Project

Use Admin void/archive flows (soft). Do not hard-delete issued financial history (`ON DELETE RESTRICT`).

---

## Deploy

```bash
git checkout main && git pull
git rev-parse HEAD   # record SHA
npm run typecheck && npm run lint && npm run test && npm run build && npm run test:e2e
npm run deploy       # or Workers Builds: build → cf:deploy
```

Record previous Worker version ID **before** deploy for rollback.

---

## Rollback Worker

```bash
npx wrangler deployments list --name che-xu-studio-site
npx wrangler versions list --name che-xu-studio-site
# Promote / rollback to previous version ID via Cloudflare Dashboard or supported wrangler rollback
```

**Code rollback ≠ DB rollback.** See [recovery.md](./recovery.md).

If rolling back past webhook/schema changes: pause Stripe webhook or Cron first if incompatible.

---

## Where are logs?

Cloudflare Dashboard → Workers → `che-xu-studio-site` → Observability/Logs.  
Also Stripe webhook attempts, Resend logs, Supabase Auth logs.

Do not paste tokens, cookies, raw webhook bodies, or card data into tickets.

---

## Backups / restore

Supabase Dashboard → Database → Backups / PITR (confirm plan).  
Storage PDFs: regenerate from immutable snapshots when possible.  
D1: separate from Supabase — export/backup per Cloudflare docs.  
Post-restore: reconcile Stripe webhooks carefully (idempotent event ids).

---

## First 24 hours / first week

**24h:** 5xx rate, webhook failures, outbox backlog, payment anomalies.  
**Week:** Cron/reminders, PDF failures, capability issues, client feedback.

---

## Payment emergency (disable new Checkout)

Unset/remove live `STRIPE_SECRET_KEY` temporarily **or** set publishable/secret empty and keep webhook secret so reconciliation can still run if needed. Prefer documenting a maintenance banner. (No `STRIPE_PAYMENTS_ENABLED` flag in code today.)

---

## Owner responsibilities

| Owner | Responsibility |
|-------|----------------|
| Business owner | Legal/billing identity, tax defaults, live Stripe onboarding, Resend branding |
| Technical operator | Secrets, migrations, deploy/rollback, Cron, BROWSER, observability |
| Both | Confirm launch-gate status before enabling `STUDIO_OS_ENABLED` for clients |

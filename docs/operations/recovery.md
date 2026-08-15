# Recovery & rollback

Practical remediation for Studio OS incidents. Prefer audited, explicit-ID repairs over broad “force paid” UI.

## Backup / restore (external)

| Asset | Strategy | Notes |
|-------|----------|-------|
| Postgres | Supabase PITR / daily backups | **Verify in Dashboard before launch** — code cannot enable this |
| Storage PDFs | Bucket objects + regenerable canonicals | Proposal/Invoice/Receipt PDFs can be regenerated from immutable snapshots; retain originals when possible |
| D1 leads | Cloudflare D1 backups / export | Marketing contact path independent of Studio |

**Pre-migration:** take a Supabase backup / PITR bookmark before applying new migrations in production.

**Pre-launch:** confirm restore owner and practice one restore to a scratch project.

## Disaster scenarios

### 1. Accidental Client archive

- Unarchive via Admin if soft-archive; contacts/projects remain.
- Do not hard-delete clients with invoices/payments (`ON DELETE RESTRICT`).

### 2. Accidentally voided Invoice

- Do not “unvoid” silently. Issue a corrected Invoice / credit workflow.
- Preserve voided row + activity history.

### 3. Bad Worker deployment

- Roll back previous Cloudflare Worker deployment in dashboard/CLI.
- **Code rollback does not roll back Postgres migrations.**

### 4. Failed migration

- Prefer forward-fix migration.
- If unsafe: restore PITR to pre-migration point, then re-apply known-good migrations.
- Document compensating SQL in a new migration file — never edit applied production migrations.

### 5. Stripe webhook outage

- Stripe retries delivery.
- Local idempotency: `webhook_events.provider_event_id` unique; payment RPCs keyed by provider payment id.
- After outage: confirm `webhook_events` processing_status; replay from Stripe dashboard if needed.
- Controlled reconcile: call `apply_succeeded_stripe_payment` / refund RPC with explicit IDs (service role only); log activity.

### 6. Resend outage

- Domain truth (acceptance, payment) must not roll back.
- Outbox retries via Cron; terminal failures visible in `email_outbox` / email logs.
- Manual retry from Admin email actions when available.

### 7. PDF / Browser Rendering outage

- Issue/send still succeeds; `document_jobs` retry.
- Capability pages remain usable as HTML; PDF download may 503 until binding recovers.

### 8. Supabase outage

- Marketing site (D1 contact, static pages) should remain up where independent.
- Studio returns sanitized errors; no secret leakage.

### 9. Capability token compromise

1. Admin: revoke public link.
2. Generate replacement link (same Proposal Version / Invoice snapshot — content unchanged).
3. Resend email with new URL.
4. Confirm old token 404s.

## Financial reconciliation procedure

When Stripe shows success but Studio is missing a Payment:

1. Confirm webhook signature secret and event in Stripe.
2. Inspect `webhook_events` for the provider event id.
3. If event never arrived: Stripe “Resend”.
4. If event failed: fix error, resend; rely on idempotency.
5. If still missing: service-role invoke `apply_succeeded_stripe_payment` with exact invoice id, amount, currency, `pi_…` / `cs_…` — **never** invent amounts from the UI.
6. Record `activity_logs` note with Stripe event id (no raw PII dumps).

Overpayment / mismatch:

- Preserve payment rows; balance stays ≥ 0; anomaly flagged in reconciliation metadata.
- Do not auto-regress Project status on refunds.
- Ops reviews surplus manually (refund in Stripe or client credit).

## Rollback compatibility

| Layer | Behavior |
|-------|----------|
| Worker | Instant previous version rollback OK for most app bugs |
| DB | Migrations are forward-only; plan coexistence or ordered migrate-then-deploy |
| Stripe webhooks | Handler must stay idempotent across old/new deploys |
| Cron | Old Cron hitting new schema: keep jobs tolerant; gate with secrets |

**Strict ordering when schema is incompatible:** apply migration → deploy Worker → verify webhook + Cron once.

## Bootstrap owner

See `docs/architecture/studio-auth.md` and `scripts/bootstrap-studio-owner.mjs`.

After first Owner exists: remove one-time credentials, ensure signup stays disabled, do not leave bootstrap broadly usable in production.

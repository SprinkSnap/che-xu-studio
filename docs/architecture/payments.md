# Payments (Phase 11)

Stripe Checkout + verified webhooks for secure Invoice capability links.

## Principles

1. **Stripe is authoritative.** Browser redirects to `/invoice/[token]?payment=processing` are presentation only. Invoices are never marked Paid from a success URL alone.
2. **Server-derived amounts.** Checkout charges `balance_due_minor` from the Invoice row at session creation time. Browser-supplied amounts are ignored.
3. **Capability tokens.** Public `/invoice/[token]` uses Phase 10 public-link architecture (hash-only storage, exact Invoice binding, revoke/replace).
4. **PCI boundary.** No custom card fields. No PAN/CVC storage. Hosted Stripe Checkout only.

## Stripe SDK / runtime

- Official `stripe` package (Workers-compatible via `nodejs_compat`)
- `src/lib/stripe/server.ts` — `Stripe.createFetchHttpClient()` + `constructEventAsync` + `createSubtleCryptoProvider()`
- Secrets: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (never `PUBLIC_`)
- Optional publishable: `PUBLIC_STRIPE_PUBLISHABLE_KEY` (not required for redirect Checkout)

## Secure Invoice links

| Rule | Behavior |
| --- | --- |
| Token | 256-bit URL-safe; SHA-256 hex stored only |
| Binding | `resource_type = invoice`, exact `resource_id` |
| Active link | One active link per Invoice (unique partial index) |
| Create | Requires `studio.invoices.write`, issued (not draft/void), positive balance |
| Revoke / replace | Soft revoke; historical rows retained; raw URL returned once |
| Headers | `private, no-store`, `noindex,nofollow,noarchive`, `Referrer-Policy: no-referrer` |
| After Paid/Void | Link may remain viewable for receipt/status; Pay disabled |

Never put the raw capability token in Stripe metadata or logs.

## Checkout

- Endpoint: `POST /api/invoices/public/[token]/checkout`
- Same-origin POST + checkout rate limiter
- Session line item: single balance line (`{invoice_number} — Project Deposit|Final Payment|Invoice`)
- Metadata: `invoice_id`, `invoice_number`, `client_id`, `project_id`, `invoice_type`
- `client_reference_id = invoice_id` (correlation only)
- Currency from Invoice (`CAD` / `USD`) — no FX conversion
- Tax/discounts already in Invoice snapshot — Stripe automatic tax/coupons disabled
- Payment methods: `card` (Apple Pay / Google Pay when Stripe + device support them)
- Success: `/invoice/[token]?payment=processing&session_id={CHECKOUT_SESSION_ID}`
- Cancel: `/invoice/[token]?payment=cancelled`
- Session reuse: open `invoice_checkout_sessions` row for same invoice+balance; Stripe idempotency key `checkout:{invoice_id}:{balance}:{updated_at}`

## Webhooks

- Endpoint: `POST /api/webhooks/stripe`
- Raw body + `Stripe-Signature` verified with `STRIPE_WEBHOOK_SECRET`
- Idempotency: `webhook_events (provider, provider_event_id)` unique
- Duplicate processed/ignored events → `200` without re-applying money
- Processing failures → `failed` status + `500` so Stripe retries (retry-safe)

Supported events:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `payment_intent.payment_failed`
- `charge.refunded`
- `refund.updated`

Only sessions with `payment_status = paid` (or `no_payment_required`) create succeeded Payments.

## Reconciliation

RPC `apply_succeeded_stripe_payment` (SECURITY DEFINER, `service_role` only):

1. Lock Invoice; validate client/currency/status
2. Upsert Payment by `provider_payment_id` (unique)
3. Recompute `net_paid = sum(amount − refunded)` for succeeded/partially_refunded/refunded
4. `amount_paid = min(net_paid, total)`; `balance = total − amount_paid`
5. Status: `partially_paid` | `paid` | `refunded`
6. `paid_at` set when balance reaches zero (preserved on repeats)
7. Overpayment flagged; balance never negative

Refund RPC `apply_succeeded_stripe_refund`:

- Upsert refund by `provider_refund_id`
- Update `payments.refunded_minor` / status
- Recompute Invoice net paid (refunds **reopen balance**)
- **Do not** auto-regress Project workflow

## Project workflow

| Invoice | When fully Paid | Project transition |
| --- | --- | --- |
| `deposit` | balance 0 | `deposit_due` → `active` (idempotent if already active) |
| `final` | balance 0 | `awaiting_final_payment` → `completed` (+ `completed_at`) |

Unexpected Project states: record anomaly activity; keep Payment + Invoice truth. Never regress on refund.

Service-client direct updates (same pattern as Phase 10 acceptance) — not `transition_project` RPC (requires studio user).

## Admin

- `/admin/payments` — list
- `/admin/payments/[id]` — detail, refunds, provider references
- Invoice detail — Create/Replace/Revoke Payment Link; payment history links

Permissions: `studio.payments.read` for history; `studio.invoices.write` for payment links. No admin “Mark Paid” override. No refund UI in Phase 11 (webhook persistence only).

## Stale Checkout risk

If balance changes after Session A is created, Session A may still be payable at Stripe. Mitigations: session reuse for same balance, expire/complete attempt rows on success, overpayment anomaly on reconcile. Prefer Stripe-only payment path initially.

## Test mode

```bash
# .dev.vars
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...   # from stripe listen

stripe listen --forward-to localhost:4321/api/webhooks/stripe
```

Card: `4242 4242 4242 4242`.

## Deferred

| Phase | Scope |
| --- | --- |
| 12 | Resend email / reminders / payment confirmations |
| 13 | PDF receipts |
| 14 | Dashboard reporting |
| Later | Admin-initiated refund UI, offline Mark Paid, Stripe Customer sync |

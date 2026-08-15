# Phase 15 — Release Hardening

Audit and hardening pass after Phases 1–14. Prefer inspect → test → narrow fix → regression test → document.

## Inventory (repository reality)

| Area | Location |
|------|----------|
| Admin UI | `src/pages/admin/**` |
| Capability docs | `/proposal/[token]`, `/invoice/[token]` (+ PDF) |
| Stripe webhook | `POST /api/webhooks/stripe` |
| Studio jobs | `POST /api/studio/jobs/process` (Bearer `CRON_SECRET`) |
| PDF APIs | `/api/studio/{proposals,invoices,payments}/…` |
| Migrations | `supabase/migrations/202608140001` … `202608140018` |
| RLS helpers | `is_studio_user()`, `is_studio_admin()`, privilege triggers |
| Private paths | `/admin`, `/proposal`, `/invoice`, `/api/studio` |

## Severity model

- **P0** — unauthorized data access, forged webhooks, privilege escalation, double payment, secret exposure → must fix
- **P1** — membership bypass, ledger forgery, token leakage, acceptance races → must fix (or keep gate BLOCKED)
- **P2** — operational / a11y / performance — fix if feasible
- **P3** — cosmetic — do not block

## Hardening delivered in code

1. **Invite-only Auth** — `supabase/config.toml` `enable_signup = false`, password length 12 (production Dashboard must mirror).
2. **Studio API session attachment** — `/api/studio/*` is a private Studio path so PDF/receipt routes receive `locals.studioSupabase`.
3. **Ledger RLS** — drop authenticated INSERT/UPDATE on `payments`, `refunds`, `webhook_events`; Stripe uses `service_role` + SECURITY DEFINER RPCs.
4. **Invoice payment fields** — after issue, only `service_role` may change `amount_paid_minor` / `balance_due_minor` / `paid_at`.
5. **Document numbering** — `next_document_number` requires `is_studio_user()` or `service_role`.
6. **Stripe mode guard** — reject mixed test/live publishable+secret pairs at client creation.
7. **Cron secret** — timing-safe compare.
8. **Capability rate limit** — `CAPABILITY_RATE_LIMITER` on Proposal accept / request-changes.
9. **Refund webhook** — no synthetic aggregate refund IDs (avoid double-count with `refund.*`).
10. **Allocation fail-closed** — corrupt proposal snapshots rejected.
11. **Health** — no `supabaseSecret` flag in JSON.
12. **Regression suite** — `npm run test:security`, `npm run check:launch`, extended `supabase:db:test`.

## Explicit non-goals

No new CRM/payment features. No Phase 16 production rollout in this phase.

## Related docs

- [production-checklist.md](./production-checklist.md)
- [recovery.md](./recovery.md)
- [launch-gate.md](./launch-gate.md)

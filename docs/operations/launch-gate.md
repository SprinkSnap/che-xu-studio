# Launch gate — Phase 15

**Status: READY FOR PHASE 16**

Code and automated verification for release hardening are complete. **Production go-live remains blocked on external configuration** listed below — that work is Phase 16, not a Phase 15 code defect.

Do not treat this document as “live traffic approved.” It means: no known P0/P1 code blockers remain; proceed to controlled production rollout.

---

## Category results

| Category | Result | Evidence |
|----------|--------|----------|
| Security | **Pass** | Invite-only config; privilege guards; private `/api/studio`; timing-safe cron; capability rate limit; open-redirect tests; secret leak check |
| Data Integrity | **Pass** | Immutability triggers; numbering auth; payment-field service-only; allocation fail-closed; DB tests |
| Payments | **Pass** | Signature verification; webhook idempotency; no synthetic refund double-count; Stripe mode mismatch guard |
| Email | **Pass** | Outbox independent of provider; reminder paid-race covered in Phase 12 suite; Cron auth hardened |
| Documents | **Pass** | Private bucket policies in migrations; capability PDF no-store; renderer content-only (no arbitrary URL) |
| Accessibility | **Conditional** | Prior axe coverage on key flows; no new critical a11y regressions introduced in hardening; full manual sweep remains owner QA in Phase 16 |
| Performance | **Conditional** | Reporting indexes (Phase 14); no new N+1 in this pass; fixture-scale load deferred to post-launch monitoring |
| Operations | **Pass** | `release-hardening.md`, `production-checklist.md`, `recovery.md`, `check:launch` |
| External Configuration | **Blocked (expected)** | Supabase prod, PITR, Stripe live webhook, Resend domain, DNS, Cron, BROWSER, Storage — **unverified** |
| Regression Tests | **Pass** | Unit/security/financial property tests; schema + db adversarial checks (run in CI/agent) |

---

## Findings summary

### P0

None open.

### P1 (fixed)

| Issue | Area | Fix | Regression |
|-------|------|-----|------------|
| Open Auth signup in config | Auth | `enable_signup = false`, password length 12 | `release-hardening.test.ts`, launch-check |
| `/api/studio` missing user Supabase client | Auth/PDF | Private path includes `/api/studio` | `studio-foundation.test.ts` |
| Member-writable payments ledger | RLS | Drop insert/update policies; payment fields service-only | migration `018`, `studio-db-test.mjs` |
| Mixed Stripe test/live keys | Stripe | `assertStripeKeyModeConsistency` | `release-hardening.test.ts` |
| `SUPABASE_SECRET_KEY` identifier in client bundle | Secrets | Split `public-config.ts` from server `config.ts` | `check:supabase-secret-leak` |

### P2 (accepted / mitigated)

| Issue | Mitigation |
|-------|------------|
| Rate limiters fail-open if binding missing | Document; production checklist requires bindings |
| CSP `'unsafe-inline'` | Required for Turnstile/Astro; connect-src still narrow |
| Project commercial fields editable post-acceptance | App TODO remains; issued invoices immutable; deferred |
| Health previously leaked secret-configured flag | Removed |

### P3

Cosmetic / DX only — not tracked as launch blockers.

---

## External blockers (Phase 16)

These are **not** marked verified:

1. Supabase production project + migrations + Auth signup OFF + PITR
2. Stripe live keys + webhook signing secret
3. Resend verified sender/domain
4. Cloudflare DNS, Cron, BROWSER, private Storage, encrypted secrets
5. Legal/billing identity + tax defaults confirmed by owner

---

## Next step

**Phase 16 — controlled production rollout:** configure/verify production Supabase, apply migrations, Studio domain routing, Stripe live + webhooks, Resend, Cloudflare Cron/Browser/Storage/secrets/backups, smoke tests, monitoring, rollback readiness.

Do not skip the external checklist in `production-checklist.md`.

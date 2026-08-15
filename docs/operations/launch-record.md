# Launch record — Phase 16

**Final status: PRODUCTION ROLLOUT BLOCKED**

| Field | Value |
|-------|--------|
| Date (UTC) | 2026-08-15 |
| Intended production branch | `main` |
| Inspected commit | `0c763c65ade439cee1179e2ca119dca9ec292d1d` |
| Tag created | None (rollout not verified) |
| Worker | `che-xu-studio-site` |
| Observed production version | `23f4bfbe-2c4d-4b8b-9227-82386da52393` (#271) |
| Domains checked | `chexustudio.com` (DNS ok); `studio.chexustudio.com` (no DNS observed) |
| Supabase ref | `ryafmmfjlbzndhojesuw` |
| Stripe | Not bound on Worker |
| Resend | Present but as plain_text — rotate + encrypt |
| Migrations applied in prod | REQUIRES MANUAL VERIFICATION |
| Smoke tests | Partial (see below) |
| Rollback reference | `npx wrangler rollback` / promote prior version ID from `wrangler versions list` |

## Phase 15 prerequisite

Confirmed `docs/operations/launch-gate.md` stated **READY FOR PHASE 16** before this evaluation.

## External services

| Service | Verified? | Notes |
|---------|-----------|-------|
| Cloudflare Worker | Partial | Exists; Studio partially enabled |
| Cloudflare D1 | Partial | Binding matches config |
| Cloudflare AI | Partial | Binding present |
| Cloudflare Cron | Partial | `scheduled` handler present; dashboard schedule REQUIRES MANUAL VERIFICATION |
| Browser Rendering | Fail / missing | No `BROWSER` on version 271 |
| Supabase project | Partial | Reachable; signup **not** disabled |
| Supabase Auth | Fail | `disable_signup: false` |
| Supabase migrations/RLS/Storage/PITR | Unverified | Manual |
| Stripe live + webhook | Unverified / missing | Manual |
| Resend domain/SPF/DKIM | Unverified | Manual |

## Smoke tests

| Test | Result |
|------|--------|
| Repo `typecheck` / `lint` / `test` / `build` / `test:e2e` | Run in Phase 16 PR verification |
| `npm run check:launch` | Pass (code-side) |
| Public HTTPS homepage (agent curl) | Cloudflare challenge — **manual browser required** |
| Auth signup disabled | **Fail** |
| Stripe webhook signature in prod | Not executed |
| Capability / PDF / payment | Not executed (blocked) |

## Known non-blocking (after P0/P1 cleared)

- No accrual accounting / credit notes / client portal (product scope)
- Agent cannot pass Cloudflare managed challenge for full public HTML smoke

## Secrets

No secret values recorded. Operator must rotate any credentials that were stored as Worker `plain_text` bindings.

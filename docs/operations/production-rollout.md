# Production rollout — Phase 16

**Status: PRODUCTION ROLLOUT BLOCKED**

**Evaluated:** 2026-08-15 (UTC)  
**Repo commit inspected:** `0c763c65ade439cee1179e2ca119dca9ec292d1d` (`main`)  
**Phase 15 gate:** `READY FOR PHASE 16` (code) — external production cutover **not** complete  
**Operator (agent):** Cloud Agent on behalf of repo owner  
**No production Worker redeploy performed in this phase** (unsafe while blockers remain)

---

## Pre-rollout gate

| Check | Result |
|-------|--------|
| `docs/operations/launch-gate.md` Phase 15 status | **READY FOR PHASE 16** |
| Unresolved Phase 15 P0/P1 in code | None |
| Clean git tree at evaluation | Yes (`main` @ `0c763c6`) |
| Agent authorized to mutate production | Partial Wrangler token present; **deploy withheld** |

---

## Deployed version (current production Worker — pre–Phase-16 cutover)

| Field | Value |
|-------|--------|
| Worker name | `che-xu-studio-site` |
| Observed version ID | `23f4bfbe-2c4d-4b8b-9227-82386da52393` (version number **271**) |
| Observed at | 2026-08-15 ~01:03 UTC (created) |
| Repo SHA of that Worker | **REQUIRES MANUAL VERIFICATION** (not labeled in Wrangler metadata) |
| Rollback reference | Prior versions listed via `npx wrangler deployments list --name che-xu-studio-site` / `wrangler versions list` — e.g. `f523c52e-3464-48cc-90ef-bfdcfacd1c98`, `3dea237a-bf07-4d72-8cb6-224a544461bc` |
| Production domains | `chexustudio.com` resolves (Cloudflare). `studio.chexustudio.com` **no DNS A/CNAME observed** from this agent |
| Stripe mode | **Not configured** on Worker (no Stripe bindings observed) |
| Resend | Key present as **plain_text** binding (must move to encrypted secret + rotate) |
| Supabase project ref | `ryafmmfjlbzndhojesuw` (from `PUBLIC_SUPABASE_URL` / gateway header) |
| Migration version (production Postgres) | **REQUIRES MANUAL VERIFICATION** |

Never record secret values in this file.

---

## Blockers (must clear before PRODUCTION LIVE)

### P0 — Security / integrity

1. **Supabase Auth public signup is enabled**  
   Production Auth settings API returned `disable_signup: false`. Studio is invite-only. **Disable signup in Supabase Dashboard immediately.**

2. **`STUDIO_OS_ENABLED=true` while signup open and Stripe incomplete**  
   Studio surfaces are gated on but payment stack is missing. Prefer `STUDIO_OS_ENABLED=false` until signup is off and secrets/migrations/smoke complete — **REQUIRES MANUAL VERIFICATION / operator action**.

3. **Secrets stored as plain_text Worker bindings**  
   Observed as `plain_text` (not `secret_text`): `SUPABASE_SECRET_KEY`, `RESEND_API_KEY`. Only `TURNSTILE_SECRET_KEY` is encrypted.  
   **Move to Cloudflare encrypted secrets and rotate** those credentials (values may have been exposed via Wrangler version metadata to operators with API token access).

### P1 — Incomplete production configuration

4. No `STRIPE_SECRET_KEY` / `PUBLIC_STRIPE_PUBLISHABLE_KEY` / `STRIPE_WEBHOOK_SECRET` on Worker  
5. No `CRON_SECRET` observed  
6. No `BROWSER` binding on observed version 271 (PDF generation unavailable)  
7. No `CAPABILITY_RATE_LIMITER` on observed version 271  
8. `STUDIO_BASE_URL` currently `https://chexustudio.com` — preferred Studio host `https://studio.chexustudio.com` not DNS-verified  
9. Supabase PITR/backups — **REQUIRES MANUAL VERIFICATION**  
10. Production migrations applied through `018` — **REQUIRES MANUAL VERIFICATION**  
11. Private `studio-documents` bucket — **REQUIRES MANUAL VERIFICATION**  
12. Resend domain SPF/DKIM — **REQUIRES MANUAL VERIFICATION**  
13. Stripe live account readiness + webhook — **REQUIRES MANUAL VERIFICATION**

---

## Verified from this environment (non-secret)

| Item | Result |
|------|--------|
| Cloudflare account auth via Wrangler | Pass (token present) |
| Worker `che-xu-studio-site` exists | Pass |
| D1 `che-xu-studio-db` id matches wrangler | Pass (`f1b23218-…`) |
| AI + CHAT/CONTACT/AUTH/CHECKOUT rate limits bound | Pass |
| Scheduled handler present (`scheduled`) | Pass (Cron schedule still **REQUIRES MANUAL VERIFICATION** in dashboard) |
| Observability enabled in `wrangler.jsonc` | Pass (code); live dash **REQUIRES MANUAL VERIFICATION** |
| `chexustudio.com` DNS → Cloudflare | Pass |
| HTTPS probe from agent | Cloudflare **bot challenge** (403) — browser smoke **REQUIRES MANUAL VERIFICATION** |
| Supabase project reachable | Pass (project ref `ryafmmfjlbzndhojesuw`) |
| Auth signup disabled | **Fail** (`disable_signup: false`) |
| Secret leak scan / release tests (repo) | See launch-record / CI commands |

---

## Ordered cutover plan (when blockers cleared)

1. Disable Supabase Auth signup; confirm `disable_signup: true`  
2. Verify/enable PITR; take pre-migration backup bookmark  
3. Apply pending `supabase/migrations` `001`–`018` to production (never `db reset`)  
4. Verify RLS + Storage bucket policies  
5. Move secrets to encrypted storage; rotate compromised plain-text keys  
6. Configure Stripe live keys + webhook `https://chexustudio.com/api/webhooks/stripe`  
7. Verify Resend domain; set `STUDIO_FROM_EMAIL` / Reply-To / Notify  
8. Add `BROWSER`, `CAPABILITY_RATE_LIMITER`, `CRON_SECRET`  
9. Set `STUDIO_BASE_URL=https://studio.chexustudio.com` after DNS  
10. Deploy `main` @ known SHA via `npm run deploy` / Workers Builds  
11. Smoke tests (see `scripts/production-smoke.mjs` + manual checklist)  
12. Only then leave `STUDIO_OS_ENABLED=true`  
13. Update launch-gate → `PRODUCTION LIVE — VERIFIED`

---

## Explicit non-actions this phase

- Did **not** run `npm run deploy` against production  
- Did **not** apply production Supabase migrations  
- Did **not** create live Stripe charges  
- Did **not** send client-facing Proposal/Invoice email  
- Did **not** invent “verified” for Dashboard/PITR/DNS email auth

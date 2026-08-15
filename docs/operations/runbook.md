# Studio OS Operations Runbook (stub — pre-launch)

**Status:** Incomplete — production launch is **blocked**.  
This stub exists so operators know where the full runbook will live after Phases 13–15 and a successful Phase 16.

Do **not** treat this file as a verified production handoff.

---

## Current truth

| Item | State |
| --- | --- |
| Launch gate | `PRODUCTION ROLLOUT BLOCKED` — see `launch-gate.md` |
| Last completed product phase on `main` | Phase 12 |
| Phase 13 PDFs / Storage | Not done |
| Phase 14 Dashboard / reporting | Not done |
| Phase 15 Release hardening | Not done |

---

## How do I log into Studio?

After launch: use `STUDIO_BASE_URL` (intended `https://studio.chexustudio.com`) → `/admin/login` with an active Studio membership (Phase 5).  
**Today:** Auth exists in code; production hostname/secrets/membership bootstrap are not Phase-16-verified.

## How do I create another staff user?

Documented in Phase 5 (`docs/architecture/studio-auth.md`): invite/bootstrap via controlled Owner process — **not** public signup.  
Finalize production Owner bootstrap only after Phase 15 gate + Phase 16 Auth verification.

## How do I rotate secrets?

Intended keys (never commit values): `SUPABASE_SECRET_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY`, `CRON_SECRET`.  
Rotate in Cloudflare encrypted secrets / provider dashboards, then redeploy. Full rotation steps land after Phase 15/16 verification.

## How do I revoke a Proposal/Invoice link?

Admin Proposal/Invoice detail → revoke client link (Phase 10/11). Mint replacement on Send/Resend (Phase 12).

## Payment succeeded in Stripe but Invoice unpaid?

1. Inspect Stripe event  
2. Inspect `webhook_events`  
3. Retry controlled reconciliation — never unaudited “mark paid”  
Full procedure requires Phase 15/16 operational verification.

## Email / reminder / PDF failures?

- Email: `email_logs` / `email_outbox` (Phase 12)  
- Reminders: settings + per-invoice override (Phase 12)  
- PDF: **Phase 13 required** before production PDF runbooks apply

## Deploy / rollback

Use repository Cloudflare deploy scripts (`package.json`).  
Rollback Worker via Cloudflare previous deployment; DB migrations do not auto-revert.  
**Phase 16 did not verify production rollback** because rollout is blocked.

## Logs / backups

Cloudflare observability + Supabase backups/PITR: `REQUIRES MANUAL VERIFICATION` after gate opens.

---

## Related

- `docs/operations/launch-gate.md`
- `docs/operations/production-rollout.md`
- `docs/operations/launch-record.md`
- `docs/architecture/studio-os.md`
- `docs/architecture/email-reminders.md`
- `docs/architecture/payments.md`
- `docs/architecture/studio-auth.md`

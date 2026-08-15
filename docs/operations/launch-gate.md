# Launch gate — production

**Status: PRODUCTION ROLLOUT BLOCKED**

Phase 15 code gate remains **READY FOR PHASE 16**.  
Phase 16 production cutover is **not** complete. Do not treat Studio OS as production-verified.

---

## Category results (post–Phase 16 evaluation)

| Category | Result | Evidence |
|----------|--------|----------|
| Security | **Blocked** | Production Auth `disable_signup: false`; secrets as plain_text bindings; Studio enabled while incomplete |
| Data Integrity | **Conditional** | Code/migrations ready; production apply/RLS **unverified** |
| Payments | **Blocked** | No Stripe bindings on Worker |
| Email | **Blocked** | Resend key not encrypted; domain auth unverified |
| Documents | **Blocked** | No `BROWSER` binding on observed production version |
| Accessibility | **Conditional** | Code suite OK; production browser smoke blocked by CF challenge / incomplete Studio |
| Performance | **Conditional** | Unverified in production |
| Operations | **Pass** | Rollout, launch-record, runbook, recovery, checklist present |
| External Configuration | **Blocked** | See `production-rollout.md` |
| Regression Tests (repo) | **Pass** | Release commands on `main` commit (see launch-record) |

---

## Required before `PRODUCTION LIVE — VERIFIED`

1. Disable Supabase public signup; re-check Auth settings  
2. Encrypt + rotate `SUPABASE_SECRET_KEY` and `RESEND_API_KEY`  
3. PITR/backup verified; migrations through `018` applied; RLS/Storage verified  
4. Stripe live keys + webhook + signature smoke (no unsafe client charges)  
5. Resend domain verified; internal transactional smoke  
6. `BROWSER` + Cron secret + capability rate limit on production Worker  
7. `studio.chexustudio.com` DNS + `STUDIO_BASE_URL`  
8. Controlled deploy from `main` SHA; smoke checklist green  
9. Update this file to **PRODUCTION LIVE — VERIFIED** only with evidence

---

## References

- [production-rollout.md](./production-rollout.md)
- [launch-record.md](./launch-record.md)
- [runbook.md](./runbook.md)
- [recovery.md](./recovery.md)
- [production-checklist.md](./production-checklist.md)

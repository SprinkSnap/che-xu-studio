# Studio OS — Supabase Foundation (Phase 3)

**Status:** Accepted  
**Related:** [studio-os.md](./studio-os.md), [Phase 1 audit](../studio-os/PHASE-1-AUDIT.md)

## Purpose

Supabase provides **Postgres + Auth + Storage** for the private Studio OS.  
Cloudflare **D1** remains the store for public marketing contact leads.

This is an intentional transitional dual-database architecture.

| Store | Path / tooling | Responsibility |
| --- | --- | --- |
| Cloudflare D1 | `/migrations` + `npm run db:*` | Public `/api/contact` leads |
| Supabase Postgres | `/supabase/migrations` + `npm run supabase:*` | Studio OS business data (Phase 4+) |

**Never apply D1 SQL with the Supabase CLI, or Supabase SQL with Wrangler D1.**

## Why two databases initially

1. Avoid destabilizing the working public contact pipeline.
2. Isolate financial/admin rollout from marketing uptime.
3. Use Postgres + RLS for Studio authorization.
4. Allow a later intentional lead → client migration (not Phase 3).

## Environment variables

| Variable | Scope | Notes |
| --- | --- | --- |
| `PUBLIC_SUPABASE_URL` | Browser + server | Project URL |
| `PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser + server | Publishable (anon) key |
| `SUPABASE_SECRET_KEY` | **Server only** | Never `PUBLIC_`; never HTML/props/logs |

Copy placeholders from `.dev.vars.example`. Do not commit real keys.

Workers Builds:

- Plain vars: `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- Encrypt secret: `SUPABASE_SECRET_KEY`

## Client modules

| Module | Role |
| --- | --- |
| `src/lib/supabase/browser.ts` | `createBrowserClient` — public credentials only |
| `src/lib/supabase/server.ts` | User/session client (`createServerClient` + cookies) and privileged service client |
| `src/lib/supabase/auth.ts` | getUser / requireAuthenticatedUser / requireStudioAdmin / requireStudioMember / signOut |
| `src/lib/supabase/config.ts` | Zod validation + host-only cookie options |
| `src/lib/supabase/database.types.ts` | Generated DB contract (Phase 4+) |

### User vs privileged clients

- **User client:** publishable key + request cookies → RLS-aware. Default for Studio queries.
- **Service client:** `SUPABASE_SECRET_KEY` → webhooks/automation only. Never the default path to “skip RLS”.

Phase 4 adds `profiles` membership + RLS helpers (`is_studio_user`, `is_studio_admin`). See [studio-database.md](./studio-database.md).

## Auth / session model

- Supabase Auth owns identity.
- Profiles/membership (Phase 4) + route enforcement (Phase 5). See [studio-auth.md](./studio-auth.md).
- Official `@supabase/ssr` cookie session (not localStorage-first).
- Cookie options: `path=/`, `SameSite=Lax`, `Secure` in production, **host-only** (no `.chexustudio.com` domain) so marketing apex does not receive Studio auth cookies.
- `@supabase/ssr` uses browser-readable cookies so server + browser clients stay synchronized (not pure HttpOnly-only).
- Authorization decisions must use `getUser()` (validated), not trust raw cookie JWT alone.
- UI visibility is never authorization.

### Request lifecycle (middleware)

```
request → identify Studio private path
       → STUDIO_OS_ENABLED gate
       → attach request-scoped user client (if configured)
       → resolve Studio profile / permissions for /admin
       → redirect anonymous to /admin/login; deny non-members & suspended
       → set locals.studioAuth + locals.studioUser
       → route handler
```

Locals: `studioSupabase`, `studioAuth`, `studioUser` (typed in `src/env.d.ts`). No fake users.

## Cloudflare Workers compatibility

Access Supabase only via the official HTTP JS clients (`@supabase/supabase-js` / `@supabase/ssr`).  
Do **not** open raw Postgres TCP from the Worker.

## Local CLI workflow

Requires Docker for full local stack.

```bash
npm run supabase:start    # start local Supabase
npm run supabase:status   # URLs + keys for .dev.vars
npm run supabase:stop
npm run supabase:db:reset # reset + apply /supabase/migrations
npm run supabase:types    # generate database.types.ts (after Phase 4 migrations)
```

Phase 3 ships an empty `/supabase/migrations` folder — no business tables yet.

## Health check

`GET /api/studio/health` returns configuration booleans only (no keys).  
Unavailable unless `STUDIO_OS_ENABLED` / local `astro dev` gate allows Studio surfaces.

## Public site isolation

Marketing pages must render when Supabase env vars are absent.  
Studio code fails closed with clear configuration errors when clients are required.

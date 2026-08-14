# Studio OS — Authentication & Authorization (Phase 5)

**Status:** Accepted  
**Related:** [studio-os.md](./studio-os.md), [supabase.md](./supabase.md), [studio-database.md](./studio-database.md)

## Identity

**Supabase Auth** owns credentials (email/password for Phase 5).  
A valid Auth user is **not** automatically a Studio member.

## Membership

`public.profiles` determines Studio membership:

| Requirement | Rule |
| --- | --- |
| Auth user | `auth.users` row via Supabase Auth |
| Profile | `profiles.auth_user_id = auth.uid()` |
| Status | `profiles.status = 'active'` |
| Role | `owner` \| `admin` \| `staff` |

Suspended profiles and authenticated non-members are denied. Application middleware signs them out and sends them to `/admin/access-denied` with a **generic** message.

## Authorization model

Defense in depth:

1. **Server authorization** — middleware + `requireStudioUser` / `requireStudioPermission` / `requireStudioRole`
2. **Database RLS** — `is_studio_user()` / `is_studio_admin()` (Phase 4) still authoritative

Never authorize from UI alone, hidden buttons, localStorage, email-only checks, or query-string flags.

### Permissions (code map)

Typed permissions live in `src/lib/auth/permissions.ts`:

- `owner` / `admin` → full current Studio permissions
- `staff` → operational subset (no `studio.settings.manage` / `studio.users.manage`)

Call `requireStudioPermission('studio.clients.write')` from pages/APIs instead of scattering `role === 'owner'`.

### Locals

| Local | Contents |
| --- | --- |
| `locals.studioSupabase` | Request-scoped user client (cookies + publishable key) |
| `locals.studioAuth` | `{ user, profile }` when authorized |
| `locals.studioUser` | Lightweight Auth user mirror |

Never expose access/refresh tokens or `SUPABASE_SECRET_KEY` through page props.

## Sessions

- Official `@supabase/ssr` cookie session (Phase 3)
- Cookies: `path=/`, `SameSite=Lax`, `Secure` in production, **host-only** (no `Domain=.chexustudio.com`)
- Authorization uses `getUser()` (validated), not raw cookie trust alone
- Cloudflare Workers: **request-scoped** clients only — never store session in isolate globals
- Middleware refreshes/reads session only on Studio `/admin` routes (not every marketing asset)

## Routes

### Public auth (no active Studio session required)

| Astro path | Production hostname mapping |
| --- | --- |
| `/admin/login` | `https://studio.chexustudio.com/login` (future rewrite) or `/admin/login` |
| `/admin/forgot-password` | `…/forgot-password` |
| `/admin/reset-password` | `…/reset-password` |
| `/admin/access-denied` | access denied |
| `POST /admin/logout` | logout mutation |

Internal organization stays under `/admin/*`. Future Cloudflare hostname routing may strip the `/admin` prefix on `studio.chexustudio.com` without changing auth rules.

### Protected

All other `/admin` and `/admin/*` routes require an **authorized** Studio member.

Unauthenticated → redirect `/admin/login?next=…` (safe internal path only).  
Authorized user hitting login → redirect to Studio dashboard / safe `next`.

Client document routes (`/proposal/*`, `/invoice/*`) remain noindex/no-store; token authorization arrives in later phases (not Studio membership login).

## Login flow

1. Validate email/password with Zod  
2. `signInWithPassword` via request-scoped Supabase client  
3. Resolve `profiles` under RLS  
4. Deny + sign out if missing/suspended (generic error — no enumeration)  
5. Record `auth.login_succeeded` in `activity_logs`  
6. Redirect via `safeStudioRedirect()`

No public self-registration UI. Invitation-controlled onboarding is future work.

## Recovery

1. `/admin/forgot-password` → `resetPasswordForEmail` with redirect  
   `STUDIO_BASE_URL` + `/admin/reset-password` (default local origin if unset)  
2. Generic success copy always  
3. `/admin/reset-password` hydrates recovery session (browser island for PKCE/hash) then updates password  
4. Activity: `auth.password_reset_requested`, `auth.password_changed`

## Logout

`POST /admin/logout` only (GET redirects to login without side effects).  
Same-origin check + Supabase `signOut` + optional activity log.

## Privileged client

`createSupabaseServiceClient` / `SUPABASE_SECRET_KEY`:

| Allowed | Not allowed |
| --- | --- |
| Explicit bootstrap script | Ordinary `/admin` page queries |
| Future webhooks / automation | “Skip RLS because it is easier” |
| Controlled admin SQL | Browser bundles / HTML |

## Bootstrap first Owner

**Preferred:** Supabase Dashboard → create Auth user → insert matching `profiles` row as `owner`/`active` using SQL as service role / dashboard SQL (bypasses self-insert RLS).

**Optional script:** `scripts/bootstrap-studio-owner.mjs`

```bash
STUDIO_BOOTSTRAP_SECRET='long-random' \
STUDIO_BOOTSTRAP_CONFIRM='long-random' \
PUBLIC_SUPABASE_URL=... \
SUPABASE_SECRET_KEY=... \
BOOTSTRAP_OWNER_EMAIL='you@example.com' \
BOOTSTRAP_OWNER_PASSWORD='long-passphrase' \
BOOTSTRAP_OWNER_DISPLAY_NAME='Owner' \
node scripts/bootstrap-studio-owner.mjs
```

Rules:

- Never hardcode owner email/password in source  
- Never auto-promote the first sign-in  
- Never expose `/make-me-admin`  
- Phase 5 migration `202608140008_profile_privilege_guards.sql` blocks self-insert and self-promotion of `role` / `status` / `auth_user_id`

## Rate limiting

Wrangler binding `AUTH_RATE_LIMITER` (30 / 60s per IP+endpoint bucket) on login / forgot / reset POSTs.  
Fails open if the binding is missing so a misconfig cannot lock out the owner.

## CSP

`connect-src` allows `https://*.supabase.co` and `wss://*.supabase.co` only (plus existing Cloudflare endpoints). No `connect-src *`.

## Environment

| Variable | Notes |
| --- | --- |
| `PUBLIC_SUPABASE_URL` | Browser + server |
| `PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser + server |
| `SUPABASE_SECRET_KEY` | Server only |
| `STUDIO_BASE_URL` | e.g. `https://studio.chexustudio.com` for reset redirects |
| `STUDIO_OS_ENABLED` | Gate for non-dev Studio surfaces |

Do **not** use `ADMIN_EMAIL` / `ADMIN_PASSWORD` env vars as the auth system.

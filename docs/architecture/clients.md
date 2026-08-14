# Studio OS — Client Management (Phase 6)

**Status:** Accepted  
**Related:** [studio-auth.md](./studio-auth.md), [studio-database.md](./studio-database.md)

## Data model

| Table | Role |
| --- | --- |
| `clients` | Company/client record, billing + company addresses, notes, soft-archive status |
| `client_contacts` | Multiple contacts per client; at most one `is_primary` |
| `client_financial_summary` | View of derived money aggregates (security_invoker) |
| `activity_logs` | Append-only audit (`client.*` actions) |

D1 leads remain on the public marketing contact pipeline. **No lead → client migration in Phase 6.**

## Permissions

| Permission | Access |
| --- | --- |
| `studio.clients.read` | List + detail |
| `studio.clients.write` | Create, edit, archive/restore, add/update contacts, set primary |

Contact **DELETE** remains RLS-restricted to active owner/admin (`is_studio_admin()`). Staff with write can manage contacts except hard-remove.

All page mutations call `requireStudioPermission` and use the **request-scoped user Supabase client** (RLS). The service key is not used for ordinary CRUD.

## Routes

| Path | Purpose |
| --- | --- |
| `/admin/clients` | Search, status filter, sort, offset pagination (25/page) |
| `/admin/clients/new` | Create client + primary contact |
| `/admin/clients/[id]` | Detail, contacts, archive/restore, related projects (Phase 7), payments/activity |
| `/admin/clients/[id]/edit` | Edit allowlisted client fields |

Pagination strategy: **offset** (`page` / `pageSize`), sufficient for Studio scale.

## Query layer

`src/lib/clients/queries.ts`

- List: filtered `clients` query + batched primary contacts, financial summary, active project counts (no N+1).
- Detail: client + contacts + financial view + recent projects/payments/activity (capped).
- Search: `ilike` on company/display/billing email and matching contact name/email.
- Sort whitelist: `updated_desc`, `name_asc`, `outstanding_desc`, `lifetime_desc`.

## Mutation layer

`src/lib/clients/mutations.ts`

| Operation | Mechanism |
| --- | --- |
| Create | RPC `create_client_with_primary_contact` (atomic client + primary) |
| Update | Allowlisted column map + `expectedUpdatedAt` conflict check |
| Archive / restore | Status + `archived_at` only (no cascade) |
| Set primary | RPC `set_primary_client_contact` |
| Contact add/update/remove | Direct table ops under RLS |

RPCs are **SECURITY INVOKER** with `is_studio_user()` checks and fixed `search_path`.

## Financial summaries

Stored money remains **integer minor units**.

| Metric | Definition | View column |
| --- | --- | --- |
| **Lifetime revenue** | Sum of `(amount_minor - refunded_minor)` for payments in `succeeded`, `partially_refunded`, `refunded` | `lifetime_paid_minor` |
| **Outstanding balance** | Sum of `balance_due_minor` for invoices in `issued`, `sent`, `partially_paid`, `overdue` | `outstanding_balance_minor` |

Excluded from outstanding: draft, void, paid, refunded invoice statuses.  
Excluded from lifetime: pending/failed/canceled payments.  
Display via `formatMoney()` / `formatMinorUnits()` (`Intl.NumberFormat`).

The view uses **scalar subqueries** (not dual joins) to avoid invoice×payment cartesian double-counting.

## Contacts

- Multiple contacts per client.
- Unique partial index: one `is_primary = true` per `client_id`.
- Switching primary clears the previous primary then sets the new one in one RPC transaction.
- Removing the sole/primary contact requires either another primary first (when multiple exist) or admin DELETE policy.

## Archive model

- Soft archive: `status = archived`, `archived_at = now()`.
- Restores to `active` with `archived_at = null`.
- Preserves contacts, projects, proposals, invoices, payments, activity.
- UI warns when active projects or outstanding balance exist; archive still allowed.
- No hard-delete in Studio UI.

## Activity events

- `client.created`
- `client.updated` (metadata: field names only)
- `client.archived` / `client.restored`
- `client.contact_added` / `client.contact_updated` / `client.contact_removed`
- `client.primary_contact_changed`

No full addresses, notes, phones, or emails in metadata.

## Security

- Server permission checks on every page mutation.
- RLS remains authoritative.
- IDOR: unknown/inaccessible UUIDs return controlled **404**.
- Mass assignment: explicit allowlists; no derived financial fields writable.
- Internal notes: text only (escaped by Astro); never on public surfaces.
- Same-origin checks on POSTs.

## Bootstrap note

Clients require an authenticated Studio member. Create an Owner first (Phase 5), then use **New Client**.

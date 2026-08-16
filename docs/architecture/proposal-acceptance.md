# Studio OS — Secure Proposal Acceptance (Phase 10)

**Status:** Accepted  
**Related:** [proposals.md](./proposals.md), [invoices.md](./invoices.md), [projects.md](./projects.md)

## Capability-link model

A public Proposal URL is a **capability link**. Possession of a valid high-entropy token grants access only to one exact immutable Proposal Version.

| Rule | Behavior |
| --- | --- |
| Entropy | 256-bit `crypto.getRandomValues` → URL-safe base64 |
| Storage | SHA-256 hex of raw token only (`public_links.token_hash`) |
| Binding | `proposal_version_id` required; never silently repoints |
| Active links | At most one active link per version; create replaces prior |
| Raw token | Returned once for copy UX; never persisted; never logged |

Invalid, revoked, or malformed tokens all return the same unavailable page (no existence leak).

## Expiration policy

- Document remains **viewable** until the link is revoked (even after proposal `expires_at`).
- **Accept** and **Request Changes** are disabled after proposal `expires_at`.
- Link `expires_at` mirrors proposal expiration for admin display.
- Revocation (`revoked_at`) immediately denies all access.

## Public route

`/proposal/[token]`

- No Studio authentication
- Renders exclusively from the immutable Proposal Version snapshot
- `Cache-Control: private, no-store`
- `X-Robots-Tag: noindex, nofollow, noarchive`
- `Referrer-Policy: strict-origin-when-cross-origin` (keeps same-origin Referer for CSRF fallback; does not leak the token URL to third parties)
- Accept/Request Changes CSRF: Astro `security.checkOrigin` is disabled (it 403s when `Origin` is omitted, which Outlook/Hotmail in-app browsers often do). App uses `isSameOriginMutation` (Origin, Referer, or `Sec-Fetch-Site: same-origin`).
- No marketing analytics / chat widgets
- Absent from sitemap (allowlist) and robots Disallow

Privileged resolution uses the **service client** only inside `src/lib/public-links/*` and acceptance services. No anonymous RLS on business tables.

## View tracking

- First successful view sets `public_links.first_viewed_at` and records one `proposal.viewed` activity event
- Later views update `last_accessed_at` only (no activity spam)
- Soft status: `draft`/`sent` → `viewed` (does not overwrite accepted/changes_requested)

## Acceptance

Fields: name, email, explicit terms checkbox (`ACCEPTANCE_TEXT_VERSION = v1`).

Evidence row in `proposal_acceptances` (unique per `proposal_version_id`):

- accepted identity
- exact version FK
- `evidence_metadata`: proposal_number, version_number, acceptance_text_version
- **IP not stored** (privacy)
- user-agent capped to 300 chars

Idempotent workflow:

1. Validate token + version
2. Insert acceptance (or load existing on unique conflict)
3. Set proposal `accepted` + `accepted_at`
4. `getOrCreateDepositInvoice` (Phase 9)
5. Issue deposit invoice if still draft (`issued`, not `sent`)
6. Project → `deposit_due` when from `proposal` or `awaiting_approval` (noop if already `deposit_due`; never regress active/completed)

Retries heal partial success without duplicate invoices or numbers.

## Request Changes

Stored in `proposal_change_requests`. Version content is never mutated. Proposal status → `changes_requested`. Acceptance disabled until Studio creates a revision and issues a new link.

## Admin UX

- Create / Replace Client Link (finalize required)
- Copy URL once
- Revoke
- Link status: Active / Viewed / Accepted / Revoked / Expired
- Acceptance identity + change requests + related invoices

## Privacy

| Data | Retention |
| --- | --- |
| IP | Not stored in Phase 10 |
| User-agent | Optional, capped, untrusted |
| Raw token | Memory only at create |

## Deferred

- Stripe invoice payment — Phase 11  
- Email delivery of links — Phase 12  
- PDF — Phase 13  
- Dashboard — Phase 14  

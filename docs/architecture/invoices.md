# Studio OS — Invoice Engine (Phase 9)

**Status:** Accepted  
**Related:** [proposals.md](./proposals.md), [projects.md](./projects.md), [clients.md](./clients.md), [studio-database.md](./studio-database.md)

## Lifecycle

Parent statuses (Phase 4 enum): `draft`, `issued`, `sent`, `partially_paid`, `paid`, `overdue`, `void`, `refunded`.

**Phase 9 actively uses:**

```
draft → issued → void
```

| Status | Phase 9 meaning |
| --- | --- |
| `draft` | Editable financial content |
| `issued` | Financial snapshot locked; internal finalize only |
| `void` | Unpaid issued invoice cancelled; number preserved |
| `overdue` | **Derived** display when due date passed, balance &gt; 0, and status is open (`issued`/`sent`/`partially_paid`) |
| `sent` | **Not set** in Phase 9 — reserved for Phase 12 email delivery |
| `paid` / `partially_paid` / `refunded` | Set by Phase 11 Stripe webhook reconciliation — never from browser success redirects |

Do not mark invoices `sent` or `paid` for demos.

## Draft vs issued

| | Draft | Issued |
| --- | --- | --- |
| Line items | Mutable | Immutable (DB trigger) |
| Totals / tax / discount | Recalculated on save | Immutable |
| Client/studio snapshot | Prefill; refreshed at issue | Immutable |
| Invoice number | Allocated at create | Fixed forever |
| Status / paid / voided_at | — | Mutable for settlement later |

**Correction policy:** Void → create a new corrected invoice. Do not reopen issued financials.

## Numbering

Atomic via `next_document_number('invoice', prefix, year)`:

- Format: `CXS-2026-001`
- Prefix from `settings.invoice_prefix` (default `CXS`)
- Counter row locked; never `COUNT(*) + 1`
- Allocated when the draft invoice row is created
- Numbers are never reused (including voided invoices)

## Money & calculations

Shared modules:

- `src/lib/finance/calculations.ts` — quantity, line amounts, proposal totals, half-up tax
- `src/lib/finance/invoice-calculations.ts` — deposit/final allocation, manual invoice totals

### Manual invoice

1. `amount_minor = trunc(quantity_scaled × rate_minor / 10_000)` per line  
2. `subtotal = Σ amounts`  
3. `discount` clamped to `[0, subtotal]`  
4. `tax = round_half_up((subtotal − discount) × tax_bps / 10_000)`  
5. `total = subtotal − discount + tax`  
6. `amount_paid = 0`, `balance_due = total` on create  

Browser totals are never trusted.

### Deposit / final allocation (proposal snapshot)

From proposal version:

- `net_base = subtotal_minor − discount_minor`
- `deposit_base = trunc(net_base × deposit_bps / 10_000)`
- `final_base = net_base − deposit_base`
- `deposit_tax = trunc(tax_minor × deposit_bps / 10_000)`
- `final_tax = tax_minor − deposit_tax`

Guarantees:

- `deposit_base + final_base = net_base`
- `deposit_tax + final_tax = tax_minor`
- `deposit_total + final_total = proposal total_minor`

Discount is **not** applied again on stage invoices (already in net base).

Odd-cent remainder is absorbed by the **final** invoice.

Line items: single descriptive lines (`50% Project Deposit — …` / `Final Project Balance — …`), not proportional splits of every proposal line.

### Due dates

- Deposit: due date = issue date (deposit required to begin)
- Final / manual: issue date + `settings.payment_terms_days` (default 14)

## Idempotent generation

Keys: `{proposal_version_id}:deposit` and `{proposal_version_id}:final`

Stored in `invoices.generation_key` with unique partial index for non-void rows.

Services (reusable by Phase 10):

- `getOrCreateDepositInvoice(...)`
- `getOrCreateFinalInvoice(...)`

Retries return the existing invoice without consuming another number.  
If only a voided row exists for the key, regeneration is refused (explicit correction later).

## Snapshots

At create (prefill) and again at issue:

- Client display name, contact, email, billing address
- Project name
- Studio business name, billing email, address (from `settings`)

Issued invoices never follow live client renames. Relational `client_id` remains for admin navigation.

Studio identity snapshot strategy: columns on `invoices` now; Phase 13 PDFs must render from these fields (or document versions), not live settings.

## Authorization

| Action | Permission |
| --- | --- |
| List / detail / preview | `studio.invoices.read` |
| Create / edit / issue / void / generate | `studio.invoices.write` |
| Payment history | `studio.payments.read` |

Ordinary CRUD uses request-scoped Supabase + RLS. No service-key convenience paths for admin pages. Public `/invoice/[token]` uses narrowly scoped capability resolution (Phase 11).

Mass assignment: forms never accept invoice number, paid amounts, balance, sent/paid/void timestamps, or provider IDs.

Optimistic concurrency: draft saves and issue/void require matching `updated_at`.

## Integrations

- **Client detail** — recent invoices + outstanding balance from `client_financial_summary`
- **Project detail** — related invoices; Create Invoice when not Inquiry
- **Proposal detail** — related invoices; Generate Deposit / Final from current version

## Deferred

| Phase | Scope |
| --- | --- |
| 10 | Public proposal acceptance → automatic deposit generation via `getOrCreateDepositInvoice` |
| 11 | Stripe payments, paid/partial status, refunds — see [payments.md](./payments.md) |
| 12 | Invoice email / reminders (`sent`) |
| 13 | PDF generation |
| 14 | Dashboard reporting |

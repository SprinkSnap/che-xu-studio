# Studio reporting + dashboard (Phase 14)

Production operational overview at `/admin`, derived from live Studio tables. No separate analytics datastore, Stripe API, Resend API, or PDF services on render.

## Architecture

```
settings.business_timezone
  → reporting period helpers (src/lib/reporting/periods.ts)
  → parallel read queries (dashboard.ts)
  → Astro SSR dashboard
```

Query modules:

| Module | Responsibility |
| --- | --- |
| `definitions.ts` | Canonical metric formulas / status sets |
| `periods.ts` | Business-timezone month/year UTC bounds |
| `financials.ts` | Outstanding + cash-event revenue |
| `projects.ts` | Active projects, proposals, deadlines |
| `activity.ts` | Recent payments/paid invoices, activity, email failures |
| `dashboard.ts` | Compose payload + attention + quick actions |

SSR only. Uses the request-scoped RLS user client — no service-key convenience path.

Indexes added in `202608140017_reporting_indexes.sql` for `payments(status, paid_at)`, `refunds(status, refunded_at)`, `activity_logs(created_at)`, `email_logs(status, created_at)`.

## Metric definitions

### Outstanding Invoices

Sum of `balance_due_minor` where:

- `balance_due_minor > 0`
- `status ∈ {issued, sent, partially_paid, overdue}`

Excludes draft, paid, void, refunded (unless a refunded invoice still has a positive collectible balance under those statuses — then current Invoice state wins).

### Unpaid Invoice count

Count of the same collectible set (`balance_due_minor > 0`). Includes overdue invoices.

### Overdue Invoices

Shared helper `isInvoiceOverdue`:

- `due_date < business_today` (date-only)
- `balance_due_minor > 0`
- status collectible (not draft/paid/void/refunded)

Dashboard shows count and overdue value (grouped by currency).

### Revenue This Month / This Year

**Cash-event net revenue** (not invoice totals, not project value):

```
net = Σ payment.amount_minor (status succeeded|partially_refunded|refunded, by paid_at)
    − Σ refund.amount_minor (status succeeded, by refunded_at)
```

Period bounds use Studio `settings.business_timezone` (default `America/Toronto`):

- Month: first local day of current month 00:00 → now
- Year: local Jan 1 00:00 → now

Converted to UTC for timestamptz filters.

### Refund period attribution

A July payment refunded in August:

- July retains the payment cash event
- August receives the refund reduction

This is cash-event reporting, not accrual-by-original-sale.

### Active Projects

`projects.status = 'active'` only.

### Proposals Awaiting Approval

`proposals.status ∈ {sent, viewed}` — delivered, pending client response.

### Changes Requested

Separate attention item: `status = changes_requested`.

## Currency

Financial totals are grouped by `currency`. CAD and USD are **never** silently summed.

- Single currency → one formatted amount
- Multiple currencies → amounts listed side-by-side with a “not converted” hint
- Chart series uses the Studio default currency only and discloses multi-currency cases

No FX conversion.

## Timezone

All reporting day/month/year boundaries use `settings.business_timezone` via `calendarDateInTimeZone` / `zonedLocalToUtc`. Invoice due dates and project target dates remain date-only (no UTC shift).

## Dashboard UX

1. Quick actions (permission-filtered)
2. Core metrics: Outstanding, Month Revenue, Year Revenue, Active Projects, Awaiting Approval, Overdue
3. Needs Attention (overdue, changes requested, past target dates, recent email failures)
4. Upcoming deadlines (30-day window) + Recent payments
5. Optional net-revenue bar chart (last 6 months) with accessible table equivalent
6. Recent operational activity

No chart library — CSS bars + HTML table.

## Authorization + RLS

- Page requires `studio.dashboard.view`
- Financial sections require `studio.payments.read` (omitted from HTML when denied)
- Activity filters payment/invoice/proposal actions by role permissions
- Quick actions require matching `*.write` permissions
- Destination routes still enforce their own permissions
- `Cache-Control: private, no-store` + `noindex` via Studio layout/middleware

## Performance

- Parallel `Promise.all` for independent reads
- Narrow column selects + head counts for scalars
- Bounded lists (8–15 rows)
- No N+1; no Stripe/Resend/PDF on render
- Query failure → “Unavailable” (never fake $0)

## Deferred

- Phase 15 hardening / launch gate
- Phase 16 production rollout
- Custom date-range analytics UI
- Accrual accounting mode
- FX conversion

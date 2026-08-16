# Email delivery, notifications, and payment reminders (Phase 12)

Studio transactional email is centralized under `src/lib/email/`. The public marketing Contact form continues to use `src/lib/notify-email.ts` and is intentionally separate.

## Resend client boundary

- Server-only: `src/lib/email/client.ts` calls Resend over HTTPS with `RESEND_API_KEY`.
- Config: `src/lib/email/config.ts` resolves From / Reply-To / Notify / public URL / Studio URL / `CRON_SECRET`.
- Prefer `STUDIO_FROM_EMAIL`, falling back to `CONTACT_FROM_EMAIL`. Reply-To prefers `STUDIO_REPLY_TO_EMAIL`.
- Never import the email client into browser bundles. Never log API keys or raw capability tokens.

## Delivery-state semantics

| Application status | Meaning |
| --- | --- |
| `queued` | Idempotency reservation in `email_logs` before provider call |
| `sent` | Resend **accepted** the message (`provider_message_id` stored) |
| `failed` | Provider rejected or transport failed |
| `delivered` / `bounced` / `complained` | Reserved for future provider webhooks — **not** inferred from send API |

Proposal `status = sent` and Invoice `status = sent` (when transitioning from `issued`) happen **only after** provider acceptance. Clicking Send alone is never enough.

## Outbox architecture

High-value side effects that must not block domain truth use `email_outbox`:

- Proposal accepted (Studio notify)
- Changes requested (Studio notify)
- Payment confirmation (client) + payment received (Studio notify)

Flow:

1. Domain transaction commits (acceptance / Stripe reconciliation / change request).
2. Insert outbox row with unique `idempotency_key` (no raw tokens in payload).
3. `processStudioJobs` claims due rows, mints capability URLs at send time if needed, sends via Resend, updates `email_logs` + outbox status.

Retries use staged backoff (5m → 30m → 2h → 12h) with a max attempt count. Permanent recipient/config failures stop retrying.

## Proposal delivery

`sendProposalEmail` / `resendProposalEmail`:

1. Require finalized exact Version; reject Accepted/Archived.
2. Resolve recipient from admin override → version contact snapshot → client billing email → primary contact.
3. Mint a fresh hashed capability link bound to that Version (`mode: 'mint'`; prior links remain valid up to cap).
4. Reserve `email_logs` with `proposal:{versionId}:delivery` (first delivery) or a resend key.
5. Send via Resend (domain click/open tracking should stay disabled so capability URLs are not rewritten).
6. On provider success → mark log sent → set Proposal `sent` + `sent_at` → Project `proposal → awaiting_approval` when allowed.
7. On failure → Proposal stays unsent; admin can retry safely. Provider error codes appear in Email history.

If the first-delivery idempotency key already succeeded, **Send delegates to Resend** (new key + fresh link) instead of returning a silent `already_sent` no-op. The admin UI uses Resend whenever `sent_at` or a successful email log exists (including expired/declined proposals).

Resend does **not** create a new Proposal Version.

## Invoice delivery

Same pattern with `invoice:{invoiceId}:delivery`. Issued invoices become `sent` only after provider acceptance. Paid invoices may receive a status/receipt-style resend when explicitly requested; normal due messaging is for open balances.

## Payment + Studio notifications

Stripe webhook → `reconcileSucceededStripePayment` commits financial truth → enqueues confirmation/notify intents. Acceptance and change-request paths enqueue after persistence. **Email failure never rolls back** payments, acceptances, invoices, or change requests.

Deposit/final messaging claims project Active/Completed **only** when the corresponding project transition succeeded.

## Reminders

- Settings: `reminders_enabled`, `business_timezone` (default `America/Toronto`), `reminder_before_due_days`, `reminder_due_day_enabled`, `reminder_overdue_days` (e.g. `{3,7}`).
- Per-invoice override: `invoices.payment_reminders_enabled`.
- Schedule evaluation uses the business timezone calendar day (not raw UTC Worker clock).
- Types: `before_due`, `due_today`, `overdue_3_days` / `overdue_7_days` / `custom`.
- Uniqueness: `(invoice_id, reminder_type, scheduled_for)`.
- Before send, invoice is reloaded; Paid/Void/zero-balance → reminder `skipped`.
- Cron: hourly Worker trigger (`15 * * * *` UTC) runs outbox + reminder scan via `POST /api/studio/jobs/process` (Bearer `CRON_SECRET`).

## Secure links

Raw tokens are generated at send time, hashed for storage, used in the email body, then discarded. Tokens are never stored in `email_logs` or `email_outbox` payloads. Multiple active hashed links per Proposal Version / Invoice are allowed (app caps); Replace still revokes all active links.

## Deliverability + privacy

- Verified production From domain (reject `resend.dev` From).
- Client-facing Reply-To enabled.
- Click tracking and open tracking are **domain-level** in Resend — keep both disabled for `chexustudio.com` so secure Proposal/Invoice URLs are not rewritten. (There is no per-message `tracking` field on Send Email.)
- No marketing UTMs on secure URLs.
- HTML + plain-text for every template; dynamic content escaped.
- Public Contact notify path unchanged.
- Admin success flash includes the recipient address; Email history on the proposal detail shows status, `failure_reason`, and Resend provider message id.
- Client Proposal/Invoice sends BCC the studio notify/From mailbox so operators can confirm provider acceptance even when the client mailbox filters mail.
- Hotmail/Outlook delivery requires a published DMARC record — see [email-deliverability.md](../operations/email-deliverability.md).

## Authorization + RLS

- Proposal send: `studio.proposals.write`
- Invoice send / reminder toggle: `studio.invoices.write`
- Settings + email preview: `studio.settings.manage`
- `email_logs` / `email_outbox` / `reminder_events`: Studio users may read per RLS; ordinary public clients cannot. Job processor uses service role narrowly.
- Cron endpoint requires `CRON_SECRET`; missing secret → 404.

## Provider webhooks

Deferred. Until implemented, `sent` means accepted by Resend, not confirmed inbox delivery.

# Email deliverability (Resend + Microsoft 365)

Studio sends Proposal/Invoice mail through Resend (`From: info@chexustudio.com`). Mailboxes for the same domain are hosted on Microsoft 365.

## What production already has

| Record | Purpose | Observed |
| --- | --- | --- |
| `resend._domainkey.chexustudio.com` TXT | Resend DKIM | Present |
| `send.chexustudio.com` MX → `feedback-smtp.us-east-1.amazonses.com` | Resend Return-Path | Present |
| `send.chexustudio.com` TXT `v=spf1 include:amazonses.com ~all` | SPF for Return-Path | Present |
| Apex TXT `v=spf1 include:spf.protection.outlook.com -all` | Microsoft 365 mailbox SPF | Present |
| `_dmarc.chexustudio.com` | DMARC policy | **Missing** |

Resend SPF is evaluated on the `send.` Return-Path host, not the apex. Leave the Microsoft 365 apex SPF in place.

## Required: publish DMARC

Hotmail/Outlook frequently quarantine or drop authenticated mail when the organizational domain has **no DMARC**. Studio `email_logs` can show `status=sent` with a Resend provider id while the client still sees nothing.

Add (Cloudflare DNS → DNS only):

```txt
_dmarc.chexustudio.com.  TXT  "v=DMARC1; p=none; rua=mailto:info@chexustudio.com; fo=1"
```

Start with `p=none` (monitor). After reports look clean, tighten to `p=quarantine` then `p=reject`.

## Hotmail / Outlook: accepted by Resend but missing from Inbox and Junk

This is expected when **DMARC is unpublished**. Microsoft consumer mail (`hotmail.com`, `outlook.com`, `live.com`) can accept the SMTP handoff from Resend and then **discard** the message — it never appears in Inbox or Junk.

Checklist:

1. Confirm Studio Email history shows `sent` + a Resend id (provider accepted the message).
2. Confirm `dig +short TXT _dmarc.chexustudio.com` returns a policy (at least `p=none`). If empty, publish DMARC before further debugging.
3. In the Resend dashboard (full-access key), open that message id → look for delivered / bounced / failed / suppressed.
4. After DMARC propagates, Resend Proposal again.
5. Ask the recipient to check Focused vs Other, Junk, Deleted, and Blocked — but missing DMARC is the first fix.

Do not keep re-sending to Hotmail before DMARC is live; that can worsen sender reputation.
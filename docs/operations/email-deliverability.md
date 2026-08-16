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

## How to verify a Resend Proposal click

1. Admin → Proposal → **Recent email attempts** should show `sent` and a `Resend <id>`.
2. Open that id in the Resend dashboard (full-access API key; send-only keys cannot read events).
3. Check the client **Junk/Spam** folder (especially `@hotmail.com` / `@outlook.com`).
4. Confirm a BCC copy arrived at the studio From mailbox (`info@chexustudio.com`) when using the latest Worker.

## Do not

- Replace apex Microsoft SPF with only `include:amazonses.com` (breaks M365).
- Point apex MX at Resend/Amazon (hijacks inbound mail).
- Enable Resend click tracking for capability-link templates (domain setting).

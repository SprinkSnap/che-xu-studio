# Email deliverability (Resend + Microsoft 365)

Studio sends Proposal/Invoice mail through Resend (`From: info@chexustudio.com`). Mailboxes for the same domain are hosted on Microsoft 365.

## What production already has

| Record | Purpose | Observed |
| --- | --- | --- |
| `resend._domainkey.chexustudio.com` TXT | Resend DKIM | Present |
| `send.chexustudio.com` MX → `feedback-smtp.us-east-1.amazonses.com` | Resend Return-Path | Present |
| `send.chexustudio.com` TXT `v=spf1 include:amazonses.com ~all` | SPF for Return-Path | Present |
| Apex TXT `v=spf1 include:spf.protection.outlook.com -all` | Microsoft 365 mailbox SPF | Present |
| `_dmarc.chexustudio.com` TXT | DMARC policy | Present (`p=none; rua=mailto:info@chexustudio.com; fo=1`) |

Resend SPF is evaluated on the `send.` Return-Path host, not the apex. Leave the Microsoft 365 apex SPF in place.

## Publish DMARC in Cloudflare (not Porkbun)

Nameservers for `chexustudio.com` are Cloudflare. Add DNS only:

| Field | Value |
| --- | --- |
| Type | TXT |
| Name | `_dmarc` (exactly — Cloudflare already appends `.chexustudio.com`) |
| Content | `v=DMARC1; p=none; rua=mailto:info@chexustudio.com; fo=1` |
| Proxy | DNS only |

If Name is set to `_dmarc.chexustudio.com`, Cloudflare creates `_dmarc.chexustudio.com.chexustudio.com` and DMARC stays broken.

Verify:

```bash
dig +short TXT _dmarc.chexustudio.com
```

## Hotmail goes to Junk (even though it is not spam)

Resend accepting the message (`email_logs.status=sent`) means SMTP handoff succeeded — not that Microsoft placed it in Inbox. After DMARC is live, Junk is usually reputation + recipient training:

1. **Confirm DMARC** — `dig` must return the TXT above (already live for chexustudio.com).
2. **Recipient action (one time):** open Junk → open the proposal/invoice email → **Not junk** / **Report not junk**, then add `info@chexustudio.com` to contacts / safe senders. Microsoft learns from that engagement.
3. **Resend once** from Studio after the client trains Hotmail (avoid repeated Hotmail sends while training).
4. **Content:** Proposal and invoice mail use a plain link CTA (not a large marketing button) and transactional wording. Studio BCC copies client sends to the From/notify mailbox so you can confirm provider accept.
5. Optional: register with [Microsoft SNDS](https://sendersupport.olc.protection.outlook.com/snds/) / sender support if Junk continues after auth + Not junk.

## Hotmail missing from Inbox and Junk

Microsoft can discard after SMTP accept when DMARC is unpublished. Publish DMARC before further debugging. With DMARC live, check studio BCC and Resend dashboard before assuming discard.

## Do not

- Replace apex Microsoft SPF with only `include:amazonses.com` (breaks M365).
- Point apex MX at Resend/Amazon (hijacks inbound mail).
- Enable Resend click tracking for capability-link templates (domain setting).
- Keep hammering the same Hotmail address while `_dmarc` is empty or before the client marks Not junk.

# Email deliverability (Resend + Microsoft 365)

Studio sends Proposal/Invoice mail through Resend (`From: info@chexustudio.com`). Mailboxes for the same domain are hosted on Microsoft 365.

**Important:** `email_logs.status=sent` means Resend accepted the message. It does **not** mean Hotmail placed it in Inbox. Consumer Hotmail/Outlook often files cold Resend/Amazon SES mail in Junk even when SPF, DKIM, and DMARC all pass.

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

## Hotmail / Outlook Junk (auth is fine)

When Proposal and Invoice resends both land in Junk:

1. **Train the recipient (required for Inbox):** Junk → open the message → **Not junk**, then add `info@chexustudio.com` to contacts / safe senders. Microsoft learns per mailbox.
2. **Resend once** after that — do not hammer the same Hotmail address.
3. **Immediate Inbox workaround:** Create Client / Payment Link in Studio, then email that URL from your **Microsoft 365 Outlook** mailbox (`info@chexustudio.com`). Same-ecosystem mail usually reaches Hotmail Inbox when Resend/SES does not.
4. **Studio mitigations already shipping:** plain-link CTA, plain HTML layout, transactional MIME headers, no PDF attachments to Hotmail/Outlook/Live, studio BCC copy.
5. **Keep `attach_pdf_by_default` off** in Studio settings (PDF attachments raise junk scores).
6. Optional reputation: [Microsoft SNDS](https://sendersupport.olc.protection.outlook.com/snds/), [sender support](https://sender.office.com/), Resend dashboard bounces/complaints.

## Hotmail missing from Inbox and Junk

Microsoft can discard after SMTP accept when DMARC is unpublished. With DMARC live, check studio BCC + Resend dashboard before assuming discard.

## Do not

- Replace apex Microsoft SPF with only `include:amazonses.com` (breaks M365).
- Point apex MX at Resend/Amazon (hijacks inbound mail).
- Enable Resend click tracking for capability-link templates (domain setting).
- Keep resending to the same Hotmail address before the client marks Not junk.
- Expect Resend alone to guarantee Inbox on first contact with consumer Microsoft mailboxes.

# Email deliverability (Resend + Microsoft 365 Graph)

Studio can send Proposal/Invoice mail two ways:

| Transport | When used | Hotmail Inbox |
| --- | --- | --- |
| **Microsoft Graph** (`info@` via Exchange Online) | Preferred when Graph env is configured | Usually Inbox (same Microsoft ecosystem) |
| **Resend** (Amazon SES) | Fallback / contact form / Graph unset | Often **Junk** on consumer Hotmail even with SPF/DKIM/DMARC |

`email_logs.status=sent` means the provider accepted the message — not Inbox placement.

## Fix Hotmail Junk (required ops)

Resend template tweaks cannot force Hotmail Inbox. Configure Graph send from your M365 mailbox:

### 1. Entra app registration

1. [Entra admin](https://entra.microsoft.com/) → App registrations → New registration (`Che Xu Studio Mail`)
2. Application permission: **Microsoft Graph → Mail.Send** → Grant admin consent
3. Certificates & secrets → New client secret → copy value once
4. Note **Directory (tenant) ID** and **Application (client) ID**

### 2. Restrict the app to `info@chexustudio.com` (recommended)

In Exchange Online PowerShell (or Entra application access policy), scope the app so it can only send as `info@chexustudio.com`.

### 3. Cloudflare Worker secrets / vars

| Binding | Type | Example |
| --- | --- | --- |
| `MICROSOFT_GRAPH_TENANT_ID` | Variable | tenant GUID |
| `MICROSOFT_GRAPH_CLIENT_ID` | Variable | app GUID |
| `MICROSOFT_GRAPH_CLIENT_SECRET` | **Secret** | client secret value |
| `MICROSOFT_GRAPH_MAILBOX` | Variable (optional) | `info@chexustudio.com` |
| `STUDIO_EMAIL_TRANSPORT` | Variable (optional) | `auto` (default), `graph`, or `resend` |

Redeploy after setting bindings. Settings → Email tools shows whether Graph is active.

### 4. Verify

1. Resend Proposal / Invoice to the Hotmail address
2. Message should appear in **Inbox** (and in Sent Items of `info@`)
3. Email history provider id starts with `graph:`

Until Graph is configured, Studio keeps using Resend and Hotmail will likely stay Junk.

## DNS already in place

| Record | Purpose |
| --- | --- |
| `resend._domainkey` | Resend DKIM |
| `send.` MX/TXT | Resend Return-Path SPF |
| Apex SPF `include:spf.protection.outlook.com -all` | M365 mailbox SPF (do not replace with SES-only) |
| `_dmarc` | `p=none; rua=mailto:info@chexustudio.com; fo=1` |

## Temporary workaround without Graph

Create Client / Payment Link → email the URL from Outlook web (`info@`) manually.

## Do not

- Replace apex Microsoft SPF with only `include:amazonses.com`
- Point apex MX at Resend/Amazon
- Expect Resend alone to guarantee Hotmail Inbox
- Hammer the same Hotmail address via Resend before Graph is live

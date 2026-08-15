# Documents + PDF generation (Phase 13)

Canonical branded PDFs for Proposals, Invoices, and Receipts share the same presentation path as client HTML documents.

## Canonical data source

| Document | Source of truth | Binding |
| --- | --- | --- |
| Proposal PDF | Immutable `proposal_versions` (+ `proposal_items`) | Exact Version ID |
| Invoice PDF | Issued invoice row snapshot (+ `invoice_items`) | Invoice ID |
| Receipt PDF | Successful `payments` + reconciled invoice snapshot | Payment ID |

Never reconstruct historical PDFs from live Client/Project pricing.

## Shared HTML / view-model reuse

```
immutable snapshot
  → src/lib/documents/*-view-model.ts
  → src/lib/documents/html.ts (escaped HTML)
  → Cloudflare Browser Rendering (print to PDF)
  → private Storage + documents row
```

Browser client pages continue to use Astro components (`ProposalDocument`, `InvoiceDocument`). PDF capture uses the same view-model builders so business content cannot drift.

Security boundary: view models expose only client-facing fields (no internal notes, tokens, Stripe secrets, or capability URLs).

## Cloudflare integration

- Binding: `BROWSER` in `wrangler.jsonc`
- Adapter: `src/lib/pdf/renderer.ts` (`@cloudflare/puppeteer`)
- Model B: trusted HTML via `page.setContent` — **never** attacker-supplied URLs (`page.goto`)
- Timeout: 45s; readiness: `data-pdf-ready` + `document.fonts.ready`
- Page size: **Letter** (Canada / Che Xu Studio default), margins 0.6in

If the Browser binding is absent, generation fails with a sanitized retryable error. Financial/acceptance truth does not depend on PDF success.

## Print styles

- Embedded print CSS in `html.ts` for PDF capture
- `src/styles/print.css` + `documents.css` for client page print
- `.studio-doc-no-print` / `.no-print` hide Accept / Pay / Download controls

## Private storage

- Bucket: `studio-documents` (private, no anon/auth object policies)
- Paths:
  - `proposals/<proposal-id>/versions/<version-id>/<document-id>.pdf`
  - `invoices/<invoice-id>/<document-id>.pdf`
  - `receipts/<payment-id>/<document-id>.pdf`
- Metadata: `documents` table (`status`, `checksum` SHA-256, `file_size`, `generation_version`, `renderer_version`, `is_canonical`)
- Retention: preserve canonical Proposal versions, issued Invoice PDFs, and Receipt PDFs

## Downloads

**Preferred client model:** server-proxied capability downloads

- `GET /proposal/[token]/pdf`
- `GET /invoice/[token]/pdf`

Flow: validate capability → resolve exact Version/Invoice → fetch private object → stream with `Content-Disposition: attachment`, `Cache-Control: private, no-store`.

Admin downloads: `GET /api/studio/proposals/[id]/pdf`, `/api/studio/invoices/[id]/pdf`, `/api/studio/payments/[id]/receipt` after Studio permission checks.

Revoked capability tokens cannot download; historical PDFs remain stored.

## Regeneration policy

| Resource | Behavior |
| --- | --- |
| Draft Proposal / Draft Invoice | HTML preview only — no canonical PDF |
| Finalized Proposal Version | Idempotent `getOrCreateProposalPdf(versionId)` |
| Issued Invoice | Idempotent `getOrCreateInvoicePdf(invoiceId)`; content is the issued commercial document (balance shown as total due, not live paid state) |
| Receipt | Idempotent per Payment |
| Explicit regenerate | Supersedes prior row (`is_canonical=false`, status `superseded`); new generation preserved |

Concurrent generation is locked by unique canonical index on `(resource_type, resource_id, document_type, version_key)` for pending/ready.

## Jobs / retries

`document_jobs` queues PDF side effects after finalize / issue / payment reconcile. Processed with email/reminder cron via `processStudioJobs`. Bounded backoff; failures do not roll back business state.

## Email attachments (optional)

When `settings.attach_pdf_by_default` is true:

- Proposal send may attach Version PDF
- Invoice send may attach issued Invoice PDF
- Payment confirmation may attach Receipt PDF

Attachments are fetched from private Storage at send time. Outbox stores only document intent via existing resource IDs — **never** raw PDF bytes. If the PDF is missing or over 8 MB, the email still sends with the secure web link.

## Security checklist

- No public bucket / no anonymous Storage listing
- No arbitrary-URL PDF rendering (SSRF)
- No capability tokens in PDF HTML, filenames, or activity metadata
- No internal notes / Stripe secrets in view models
- Public downloads enforce exact resource binding + revocation
- Password-protected PDFs are not used for access control

## Deferred

- Phase 14 dashboard / reporting aggregates
- Tagged-PDF / full PDF/UA compliance (engine limitation)
- Separate refund-credit document type

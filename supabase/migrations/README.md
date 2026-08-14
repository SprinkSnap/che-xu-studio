# Studio Postgres migrations

These SQL files are **Supabase/Postgres** migrations for Studio OS.

Cloudflare D1 lead migrations live in `/migrations` and are applied with Wrangler (`npm run db:*`).

Do not apply this folder with Wrangler D1, and do not apply `/migrations` with the Supabase CLI.

Phase 4 files:

1. `202608140001_core_identity.sql`
2. `202608140002_clients_projects.sql`
3. `202608140003_proposals.sql`
4. `202608140004_invoices_payments.sql`
5. `202608140005_operations.sql`
6. `202608140006_immutability.sql`
7. `202608140007_rls.sql`

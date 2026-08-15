-- Phase 14 — reporting query indexes (no analytics datastore)
-- Supports dashboard cash-event revenue windows and operational lists.

CREATE INDEX IF NOT EXISTS payments_status_paid_at_idx
  ON public.payments (status, paid_at DESC)
  WHERE paid_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS refunds_status_refunded_at_idx
  ON public.refunds (status, refunded_at DESC)
  WHERE refunded_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS activity_logs_created_at_idx
  ON public.activity_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS email_logs_status_created_at_idx
  ON public.email_logs (status, created_at DESC);

COMMENT ON INDEX public.payments_status_paid_at_idx IS
  'Dashboard Revenue This Month/Year cash-event payment attribution.';
COMMENT ON INDEX public.refunds_status_refunded_at_idx IS
  'Dashboard Revenue cash-event refund attribution by refunded_at.';

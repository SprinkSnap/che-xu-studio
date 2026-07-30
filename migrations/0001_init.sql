-- Consented lead records from the contact form.
CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  service_interest TEXT NOT NULL,
  message TEXT NOT NULL,
  phone TEXT,
  marketing_consent INTEGER NOT NULL DEFAULT 0,
  current_website TEXT,
  business_type TEXT,
  primary_goal TEXT,
  pages_features TEXT,
  budget_range TEXT,
  target_timeline TEXT,
  preferred_contact TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at);
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);

-- Verified order records updated after Stripe webhook verification.
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY NOT NULL,
  stripe_session_id TEXT NOT NULL UNIQUE,
  stripe_event_id TEXT,
  plan_id TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  amount_total INTEGER,
  currency TEXT,
  status TEXT NOT NULL,
  mode TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

-- Stripe event idempotency ledger.
CREATE TABLE IF NOT EXISTS stripe_events (
  id TEXT PRIMARY KEY NOT NULL,
  type TEXT NOT NULL,
  created_at TEXT NOT NULL
);

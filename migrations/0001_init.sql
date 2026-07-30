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

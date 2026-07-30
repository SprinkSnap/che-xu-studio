export interface LeadRecord {
  id: string;
  name: string;
  email: string;
  serviceInterest: string;
  message: string;
  phone?: string;
  marketingConsent: boolean;
  currentWebsite?: string;
  businessType?: string;
  primaryGoal?: string;
  pagesFeatures?: string;
  budgetRange?: string;
  targetTimeline?: string;
  preferredContact?: string;
  createdAt: string;
}

export interface OrderRecord {
  id: string;
  stripeSessionId: string;
  stripeEventId?: string;
  planId: string;
  customerEmail: string;
  customerName: string;
  amountTotal?: number;
  currency?: string;
  status: string;
  mode: string;
  createdAt: string;
  updatedAt: string;
}

export async function insertLead(db: D1Database, lead: LeadRecord): Promise<void> {
  await db
    .prepare(
      `INSERT INTO leads (
        id, name, email, service_interest, message, phone, marketing_consent,
        current_website, business_type, primary_goal, pages_features,
        budget_range, target_timeline, preferred_contact, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      lead.id,
      lead.name,
      lead.email,
      lead.serviceInterest,
      lead.message,
      lead.phone ?? null,
      lead.marketingConsent ? 1 : 0,
      lead.currentWebsite ?? null,
      lead.businessType ?? null,
      lead.primaryGoal ?? null,
      lead.pagesFeatures ?? null,
      lead.budgetRange ?? null,
      lead.targetTimeline ?? null,
      lead.preferredContact ?? null,
      lead.createdAt,
    )
    .run();
}

export async function upsertOrder(db: D1Database, order: OrderRecord): Promise<void> {
  await db
    .prepare(
      `INSERT INTO orders (
        id, stripe_session_id, stripe_event_id, plan_id, customer_email, customer_name,
        amount_total, currency, status, mode, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(stripe_session_id) DO UPDATE SET
        stripe_event_id = COALESCE(excluded.stripe_event_id, orders.stripe_event_id),
        status = excluded.status,
        amount_total = COALESCE(excluded.amount_total, orders.amount_total),
        currency = COALESCE(excluded.currency, orders.currency),
        updated_at = excluded.updated_at`,
    )
    .bind(
      order.id,
      order.stripeSessionId,
      order.stripeEventId ?? null,
      order.planId,
      order.customerEmail,
      order.customerName,
      order.amountTotal ?? null,
      order.currency ?? null,
      order.status,
      order.mode,
      order.createdAt,
      order.updatedAt,
    )
    .run();
}

export async function hasProcessedEvent(db: D1Database, eventId: string): Promise<boolean> {
  const row = await db
    .prepare('SELECT id FROM stripe_events WHERE id = ?')
    .bind(eventId)
    .first<{ id: string }>();
  return Boolean(row);
}

export async function markEventProcessed(
  db: D1Database,
  eventId: string,
  type: string,
  createdAt: string,
): Promise<void> {
  await db
    .prepare(
      'INSERT OR IGNORE INTO stripe_events (id, type, created_at) VALUES (?, ?, ?)',
    )
    .bind(eventId, type, createdAt)
    .run();
}

export async function getOrderBySession(
  db: D1Database,
  sessionId: string,
): Promise<OrderRecord | null> {
  const row = await db
    .prepare(
      `SELECT id, stripe_session_id as stripeSessionId, stripe_event_id as stripeEventId,
              plan_id as planId, customer_email as customerEmail, customer_name as customerName,
              amount_total as amountTotal, currency, status, mode,
              created_at as createdAt, updated_at as updatedAt
       FROM orders WHERE stripe_session_id = ?`,
    )
    .bind(sessionId)
    .first<OrderRecord>();
  return row ?? null;
}

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

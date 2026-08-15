/**
 * Studio activity logging (clients, projects, and future domains).
 * Never store passwords, tokens, full addresses, notes, phones, or emails in metadata.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '../supabase/database.types';

export type StudioActivityAction =
  | 'client.created'
  | 'client.updated'
  | 'client.archived'
  | 'client.restored'
  | 'client.contact_added'
  | 'client.contact_updated'
  | 'client.contact_removed'
  | 'client.primary_contact_changed'
  | 'project.created'
  | 'project.updated'
  | 'project.status_changed'
  | 'project.archived'
  | 'project.restored'
  | 'proposal.created'
  | 'proposal.updated'
  | 'proposal.version_created'
  | 'proposal.finalized'
  | 'proposal.archived'
  | 'proposal_template.created'
  | 'proposal_template.updated'
  | 'proposal_template.archived'
  | 'proposal_template.default_changed'
  | 'invoice.created'
  | 'invoice.updated'
  | 'invoice.issued'
  | 'invoice.voided'
  | 'invoice.deposit_generated'
  | 'invoice.final_generated'
  | 'invoice.public_link_created'
  | 'invoice.public_link_revoked'
  | 'invoice.viewed'
  | 'invoice.partially_paid'
  | 'invoice.paid'
  | 'proposal.public_link_created'
  | 'proposal.public_link_revoked'
  | 'proposal.viewed'
  | 'proposal.accepted'
  | 'proposal.changes_requested'
  | 'proposal.sent'
  | 'proposal.email_failed'
  | 'payment.checkout_created'
  | 'payment.succeeded'
  | 'payment.failed'
  | 'payment.refunded'
  | 'payment.confirmation_sent'
  | 'invoice.sent'
  | 'invoice.email_failed'
  | 'invoice.reminder_sent'
  | 'invoice.reminder_failed'
  | 'proposal.pdf_generated'
  | 'proposal.pdf_regenerated'
  | 'invoice.pdf_generated'
  | 'invoice.pdf_regenerated'
  | 'payment.receipt_generated'
  | 'document.generation_failed';

export type StudioActivityActorType = 'user' | 'system' | 'stripe' | 'client';

type ActivityClient = SupabaseClient<Database>;

export async function recordStudioActivity(
  client: ActivityClient,
  input: {
    actorProfileId?: string | null;
    actorType?: StudioActivityActorType;
    action: StudioActivityAction;
    clientId?: string | null;
    projectId?: string | null;
    subjectType?: string;
    subjectId?: string | null;
    metadata?: Record<string, Json | undefined>;
  },
): Promise<void> {
  try {
    const metadata: Record<string, Json> = {};
    if (input.metadata) {
      for (const [key, value] of Object.entries(input.metadata)) {
        if (value !== undefined) metadata[key] = value;
      }
    }

    const actorType: StudioActivityActorType =
      input.actorType ?? (input.actorProfileId ? 'user' : 'system');

    await client.from('activity_logs').insert({
      actor_user_id: input.actorProfileId ?? null,
      actor_type: actorType,
      client_id: input.clientId ?? null,
      project_id: input.projectId ?? null,
      action: input.action,
      subject_type: input.subjectType ?? 'client',
      subject_id: input.subjectId ?? input.projectId ?? input.clientId ?? null,
      metadata,
    });
  } catch {
    // Best-effort — never break UX.
  }
}

export function humanizeStudioActivity(action: string): string {
  const map: Record<string, string> = {
    'client.created': 'Client created',
    'client.updated': 'Client updated',
    'client.archived': 'Client archived',
    'client.restored': 'Client restored',
    'client.contact_added': 'Contact added',
    'client.contact_updated': 'Contact updated',
    'client.contact_removed': 'Contact removed',
    'client.primary_contact_changed': 'Primary contact changed',
    'project.created': 'Project created',
    'project.updated': 'Project updated',
    'project.status_changed': 'Project status changed',
    'project.archived': 'Project archived',
    'project.restored': 'Project restored',
    'proposal.created': 'Proposal created',
    'proposal.updated': 'Proposal updated',
    'proposal.version_created': 'Proposal revision created',
    'proposal.finalized': 'Proposal version finalized',
    'proposal.archived': 'Proposal archived',
    'proposal_template.created': 'Proposal template created',
    'proposal_template.updated': 'Proposal template updated',
    'proposal_template.archived': 'Proposal template archived',
    'proposal_template.default_changed': 'Default proposal template changed',
    'invoice.created': 'Invoice created',
    'invoice.updated': 'Invoice updated',
    'invoice.issued': 'Invoice issued',
    'invoice.voided': 'Invoice voided',
    'invoice.deposit_generated': 'Deposit invoice generated',
    'invoice.final_generated': 'Final invoice generated',
    'proposal.public_link_created': 'Client proposal link created',
    'proposal.public_link_revoked': 'Client proposal link revoked',
    'proposal.viewed': 'Proposal viewed by client',
    'proposal.accepted': 'Proposal accepted',
    'proposal.changes_requested': 'Proposal changes requested',
    'proposal.sent': 'Proposal email sent',
    'proposal.email_failed': 'Proposal email failed',
    'invoice.public_link_created': 'Client invoice link created',
    'invoice.public_link_revoked': 'Client invoice link revoked',
    'invoice.viewed': 'Invoice viewed by client',
    'invoice.partially_paid': 'Invoice partially paid',
    'invoice.paid': 'Invoice paid',
    'invoice.sent': 'Invoice email sent',
    'invoice.email_failed': 'Invoice email failed',
    'invoice.reminder_sent': 'Invoice reminder sent',
    'invoice.reminder_failed': 'Invoice reminder failed',
    'payment.checkout_created': 'Checkout session created',
    'payment.succeeded': 'Payment succeeded',
    'payment.failed': 'Payment failed',
    'payment.refunded': 'Payment refunded',
    'payment.confirmation_sent': 'Payment confirmation email sent',
    'proposal.pdf_generated': 'Proposal PDF generated',
    'proposal.pdf_regenerated': 'Proposal PDF regenerated',
    'invoice.pdf_generated': 'Invoice PDF generated',
    'invoice.pdf_regenerated': 'Invoice PDF regenerated',
    'payment.receipt_generated': 'Payment receipt generated',
    'document.generation_failed': 'Document generation failed',
  };
  return map[action] ?? action.replace(/\./g, ' ');
}

/**
 * Enqueue notification intents after domain events (non-blocking).
 */

import type { StudioSupabaseServiceClient, StudioSupabaseClient } from '../supabase/types';
import { enqueueEmailOutbox } from './outbox';
import {
  getStudioNotifyEmail,
  readStudioEmailEnvFromRuntime,
  type StudioEmailEnvSource,
} from './config';

type AnyClient = StudioSupabaseClient | StudioSupabaseServiceClient;

export async function enqueueProposalAcceptedNotification(
  client: AnyClient,
  input: {
    proposalId: string;
    proposalVersionId: string;
    clientId: string;
    projectId: string;
    proposalNumber: string;
    projectName: string;
    clientName: string;
    invoiceId?: string | null;
    invoiceNumber?: string | null;
    invoiceTotalMinor?: number | null;
    currency?: string | null;
  },
  emailEnv?: StudioEmailEnvSource,
): Promise<void> {
  const env = emailEnv ?? (await readStudioEmailEnvFromRuntime());
  const notify = getStudioNotifyEmail(env);
  if (!notify) return;

  await enqueueEmailOutbox(client, {
    emailType: 'proposal_accepted',
    recipientEmail: notify,
    resourceType: 'proposal',
    resourceId: input.proposalId,
    idempotencyKey: `proposal:${input.proposalVersionId}:accepted_notify`,
    clientId: input.clientId,
    projectId: input.projectId,
    proposalId: input.proposalId,
    invoiceId: input.invoiceId ?? null,
    payload: {
      proposal_number: input.proposalNumber,
      project_name: input.projectName,
      client_name: input.clientName,
      invoice_number: input.invoiceNumber ?? null,
      invoice_total_minor: input.invoiceTotalMinor ?? null,
      currency: input.currency ?? null,
    },
  });
}

export async function enqueueProposalChangesNotification(
  client: AnyClient,
  input: {
    proposalId: string;
    proposalVersionId: string;
    changeRequestId: string;
    clientId: string;
    projectId: string;
    proposalNumber: string;
    projectName: string;
    clientName: string;
    message: string;
  },
  emailEnv?: StudioEmailEnvSource,
): Promise<void> {
  const env = emailEnv ?? (await readStudioEmailEnvFromRuntime());
  const notify = getStudioNotifyEmail(env);
  if (!notify) return;

  await enqueueEmailOutbox(client, {
    emailType: 'proposal_changes_requested',
    recipientEmail: notify,
    resourceType: 'proposal_change_request',
    resourceId: input.changeRequestId,
    idempotencyKey: `proposal:${input.changeRequestId}:changes_notify`,
    clientId: input.clientId,
    projectId: input.projectId,
    proposalId: input.proposalId,
    payload: {
      proposal_number: input.proposalNumber,
      project_name: input.projectName,
      client_name: input.clientName,
      message: input.message.slice(0, 2000),
    },
  });
}

export async function enqueuePaymentReceivedEmails(
  client: AnyClient,
  input: {
    paymentId: string;
    invoiceId: string;
    clientId: string;
    projectId: string | null;
    invoiceNumber: string;
    amountMinor: number;
    balanceDueMinor: number;
    currency: string;
    paymentMethod: string | null;
    paidAt: string | null;
    projectName: string | null;
    contactEmail: string | null;
    contactName: string | null;
    invoiceType: string;
    depositActivated: boolean;
    finalCompleted: boolean;
  },
  emailEnv?: StudioEmailEnvSource,
): Promise<void> {
  const env = emailEnv ?? (await readStudioEmailEnvFromRuntime());

  if (input.contactEmail) {
    await enqueueEmailOutbox(client, {
      emailType: 'payment_received',
      recipientEmail: input.contactEmail,
      resourceType: 'payment',
      resourceId: input.paymentId,
      idempotencyKey: `payment:${input.paymentId}:confirmation`,
      clientId: input.clientId,
      projectId: input.projectId,
      invoiceId: input.invoiceId,
      paymentId: input.paymentId,
      payload: {
        audience: 'client',
        invoice_number: input.invoiceNumber,
        amount_minor: input.amountMinor,
        balance_due_minor: input.balanceDueMinor,
        currency: input.currency,
        payment_method: input.paymentMethod,
        paid_at: input.paidAt,
        project_name: input.projectName,
        contact_name: input.contactName,
        invoice_type: input.invoiceType,
        deposit_activated: input.depositActivated,
        final_completed: input.finalCompleted,
      },
    });
  }

  const notify = getStudioNotifyEmail(env);
  if (notify) {
    await enqueueEmailOutbox(client, {
      emailType: 'payment_received',
      recipientEmail: notify,
      resourceType: 'payment',
      resourceId: input.paymentId,
      idempotencyKey: `payment:${input.paymentId}:studio_notify`,
      clientId: input.clientId,
      projectId: input.projectId,
      invoiceId: input.invoiceId,
      paymentId: input.paymentId,
      payload: {
        audience: 'studio',
        invoice_number: input.invoiceNumber,
        amount_minor: input.amountMinor,
        balance_due_minor: input.balanceDueMinor,
        currency: input.currency,
        project_name: input.projectName,
        invoice_type: input.invoiceType,
        deposit_activated: input.depositActivated,
        final_completed: input.finalCompleted,
      },
    });
  }
}

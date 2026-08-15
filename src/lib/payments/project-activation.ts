/**
 * Project activation / completion after Invoice payment — service-client path.
 * Mirrors Phase 10 acceptance: do not call transition_project RPC (requires studio user).
 * Never regress operational states; record anomalies for review.
 */

import type { StudioSupabaseServiceClient } from '../supabase/types';
import { recordStudioActivity } from '../studio/activity';
import { transitionSideEffects, type ProjectStatus } from '../projects/workflow';

export type ProjectPaymentTransitionResult = {
  changed: boolean;
  from: ProjectStatus | null;
  to: ProjectStatus | null;
  anomaly: string | null;
};

async function loadProject(
  service: StudioSupabaseServiceClient,
  projectId: string,
): Promise<{ id: string; status: ProjectStatus; client_id: string } | null> {
  const { data, error } = await service
    .from('projects')
    .select('id, status, client_id')
    .eq('id', projectId)
    .maybeSingle();
  if (error || !data) return null;
  return data as { id: string; status: ProjectStatus; client_id: string };
}

/**
 * Deposit Invoice fully paid → Project Active (from deposit_due only).
 */
export async function applyDepositPaidProjectTransition(
  service: StudioSupabaseServiceClient,
  input: { projectId: string; clientId: string; invoiceId: string },
): Promise<ProjectPaymentTransitionResult> {
  const project = await loadProject(service, input.projectId);
  if (!project) {
    return { changed: false, from: null, to: null, anomaly: 'project_missing' };
  }

  if (project.status === 'active') {
    return { changed: false, from: 'active', to: 'active', anomaly: null };
  }

  if (
    project.status === 'awaiting_final_payment' ||
    project.status === 'completed' ||
    project.status === 'archived'
  ) {
    await recordStudioActivity(service, {
      actorProfileId: null,
      actorType: 'stripe',
      action: 'project.status_changed',
      clientId: input.clientId,
      projectId: input.projectId,
      subjectType: 'project',
      subjectId: input.projectId,
      metadata: {
        from: project.status,
        to: project.status,
        note: 'deposit_payment_skipped_regress',
        invoice_id: input.invoiceId,
      },
    });
    return {
      changed: false,
      from: project.status,
      to: project.status,
      anomaly: 'deposit_paid_unexpected_project_status',
    };
  }

  if (project.status !== 'deposit_due') {
    await recordStudioActivity(service, {
      actorProfileId: null,
      actorType: 'stripe',
      action: 'project.status_changed',
      clientId: input.clientId,
      projectId: input.projectId,
      subjectType: 'project',
      subjectId: input.projectId,
      metadata: {
        from: project.status,
        to: project.status,
        note: 'deposit_payment_anomaly_status',
        invoice_id: input.invoiceId,
      },
    });
    return {
      changed: false,
      from: project.status,
      to: project.status,
      anomaly: 'deposit_paid_unexpected_project_status',
    };
  }

  const from = project.status;
  const { data: updated, error } = await service
    .from('projects')
    .update({ status: 'active' })
    .eq('id', input.projectId)
    .eq('status', 'deposit_due')
    .select('id, status')
    .maybeSingle();

  if (error) {
    return { changed: false, from, to: null, anomaly: 'project_update_failed' };
  }
  if (!updated) {
    const again = await loadProject(service, input.projectId);
    if (again?.status === 'active') {
      return { changed: false, from, to: 'active', anomaly: null };
    }
    return { changed: false, from, to: again?.status ?? null, anomaly: 'concurrent_transition' };
  }

  await recordStudioActivity(service, {
    actorProfileId: null,
    actorType: 'stripe',
    action: 'project.status_changed',
    clientId: input.clientId,
    projectId: input.projectId,
    subjectType: 'project',
    subjectId: input.projectId,
    metadata: {
      from,
      to: 'active',
      reason: 'deposit_invoice_paid',
      invoice_id: input.invoiceId,
    },
  });

  return { changed: true, from, to: 'active', anomaly: null };
}

/**
 * Final Invoice fully paid → Project Completed (from awaiting_final_payment only).
 */
export async function applyFinalPaidProjectTransition(
  service: StudioSupabaseServiceClient,
  input: { projectId: string; clientId: string; invoiceId: string },
): Promise<ProjectPaymentTransitionResult> {
  const project = await loadProject(service, input.projectId);
  if (!project) {
    return { changed: false, from: null, to: null, anomaly: 'project_missing' };
  }

  if (project.status === 'completed') {
    return { changed: false, from: 'completed', to: 'completed', anomaly: null };
  }

  if (project.status === 'archived') {
    await recordStudioActivity(service, {
      actorProfileId: null,
      actorType: 'stripe',
      action: 'project.status_changed',
      clientId: input.clientId,
      projectId: input.projectId,
      subjectType: 'project',
      subjectId: input.projectId,
      metadata: {
        from: project.status,
        to: project.status,
        note: 'final_payment_skipped_archived',
        invoice_id: input.invoiceId,
      },
    });
    return {
      changed: false,
      from: 'archived',
      to: 'archived',
      anomaly: 'final_paid_unexpected_project_status',
    };
  }

  if (project.status !== 'awaiting_final_payment') {
    await recordStudioActivity(service, {
      actorProfileId: null,
      actorType: 'stripe',
      action: 'project.status_changed',
      clientId: input.clientId,
      projectId: input.projectId,
      subjectType: 'project',
      subjectId: input.projectId,
      metadata: {
        from: project.status,
        to: project.status,
        note: 'final_payment_anomaly_status',
        invoice_id: input.invoiceId,
      },
    });
    return {
      changed: false,
      from: project.status,
      to: project.status,
      anomaly: 'final_paid_unexpected_project_status',
    };
  }

  const from = project.status;
  const effects = transitionSideEffects(from, 'completed');
  const patch: {
    status: 'completed';
    completed_at?: string | null;
  } = { status: 'completed' };
  if (effects.completed_at !== undefined) patch.completed_at = effects.completed_at;

  const { data: updated, error } = await service
    .from('projects')
    .update(patch)
    .eq('id', input.projectId)
    .eq('status', 'awaiting_final_payment')
    .select('id, status')
    .maybeSingle();

  if (error) {
    return { changed: false, from, to: null, anomaly: 'project_update_failed' };
  }
  if (!updated) {
    const again = await loadProject(service, input.projectId);
    if (again?.status === 'completed') {
      return { changed: false, from, to: 'completed', anomaly: null };
    }
    return { changed: false, from, to: again?.status ?? null, anomaly: 'concurrent_transition' };
  }

  await recordStudioActivity(service, {
    actorProfileId: null,
    actorType: 'stripe',
    action: 'project.status_changed',
    clientId: input.clientId,
    projectId: input.projectId,
    subjectType: 'project',
    subjectId: input.projectId,
    metadata: {
      from,
      to: 'completed',
      reason: 'final_invoice_paid',
      invoice_id: input.invoiceId,
    },
  });

  return { changed: true, from, to: 'completed', anomaly: null };
}

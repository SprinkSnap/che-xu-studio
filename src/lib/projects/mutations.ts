/**
 * Project mutations — allowlisted fields + centralized workflow transitions.
 */

import type { StudioSupabaseClient } from '../supabase/types';
import { recordStudioActivity } from '../studio/activity';
import type { CreateProjectInput, UpdateProjectInput } from './validation';
import {
  PROJECT_CONFLICT_ERROR,
  PROJECT_TRANSITION_CONFLICT_ERROR,
} from './validation';
import {
  assertCanTransitionProject,
  transitionSideEffects,
  type ProjectStatus,
} from './workflow';
import { assertClientAccessible } from './queries';
import type { ProjectRow } from './types';

export class ProjectMutationError extends Error {
  readonly code: 'conflict' | 'not_found' | 'forbidden' | 'invalid' | 'failed';

  constructor(code: ProjectMutationError['code'], message: string) {
    super(message);
    this.name = 'ProjectMutationError';
    this.code = code;
  }
}

function mapWriteFields(input: CreateProjectInput | UpdateProjectInput) {
  return {
    client_id: input.clientId,
    name: input.name,
    project_type: input.projectType,
    description: input.description,
    scope: input.scope,
    deliverables: input.deliverables,
    start_date: input.startDate,
    target_completion_date: input.targetCompletionDate,
    project_price_minor: input.projectPriceMinor,
    currency: input.currency,
    tax_bps: input.taxBps,
    deposit_bps: input.depositBps,
    internal_notes: input.internalNotes,
  };
}

export async function createProject(
  supabase: StudioSupabaseClient,
  input: CreateProjectInput,
  actorProfileId: string | null,
): Promise<string> {
  await assertClientAccessible(supabase, input.clientId);

  const fields = mapWriteFields(input);
  const { data, error } = await supabase
    .from('projects')
    .insert({
      ...fields,
      status: 'inquiry',
    })
    .select('id')
    .single();

  if (error || !data) {
    throw new ProjectMutationError('failed', 'Unable to create project.');
  }

  await recordStudioActivity(supabase, {
    actorProfileId,
    action: 'project.created',
    clientId: input.clientId,
    projectId: data.id,
    subjectType: 'project',
    subjectId: data.id,
    metadata: { fields: ['name', 'client_id', 'status'] },
  });

  return data.id;
}

export async function updateProject(
  supabase: StudioSupabaseClient,
  projectId: string,
  input: UpdateProjectInput,
  actorProfileId: string | null,
): Promise<ProjectRow> {
  const { data: existing, error: loadError } = await supabase
    .from('projects')
    .select('id, updated_at, status, client_id')
    .eq('id', projectId)
    .maybeSingle();

  if (loadError) throw new ProjectMutationError('failed', 'Unable to save project.');
  if (!existing) throw new ProjectMutationError('not_found', 'Project not found.');

  if (
    input.expectedUpdatedAt &&
    existing.updated_at &&
    existing.updated_at !== input.expectedUpdatedAt
  ) {
    throw new ProjectMutationError('conflict', PROJECT_CONFLICT_ERROR);
  }

  // Re-validate client access when relationship changes; allow archived client only if already linked.
  await assertClientAccessible(supabase, input.clientId, {
    allowArchived: input.clientId === existing.client_id,
  });

  const fields = mapWriteFields(input);
  // Status is never updated here — only via transitionProject.
  const { data, error } = await supabase
    .from('projects')
    .update(fields)
    .eq('id', projectId)
    .select('*')
    .maybeSingle();

  if (error || !data) {
    throw new ProjectMutationError('failed', 'Unable to save project.');
  }

  await recordStudioActivity(supabase, {
    actorProfileId,
    action: 'project.updated',
    clientId: data.client_id,
    projectId,
    subjectType: 'project',
    subjectId: projectId,
    metadata: { fields: Object.keys(fields) },
  });

  return data;
}

export async function transitionProject(
  supabase: StudioSupabaseClient,
  projectId: string,
  expectedStatus: ProjectStatus,
  targetStatus: ProjectStatus,
  actorProfileId: string | null,
): Promise<ProjectRow> {
  try {
    assertCanTransitionProject(expectedStatus, targetStatus);
  } catch {
    throw new ProjectMutationError('invalid', 'That status change is not allowed.');
  }

  const effects = transitionSideEffects(expectedStatus, targetStatus);
  const patch: {
    status: ProjectStatus;
    completed_at?: string | null;
    archived_at?: string | null;
    status_before_archive?: ProjectStatus | null;
  } = {
    status: targetStatus,
  };
  if (effects.completed_at !== undefined) patch.completed_at = effects.completed_at;
  if (effects.archived_at !== undefined) patch.archived_at = effects.archived_at;
  if (effects.status_before_archive !== undefined) {
    patch.status_before_archive = effects.status_before_archive;
  }

  // Prefer RPC when available for atomic expected-status check.
  const { data: rpcData, error: rpcError } = await supabase.rpc('transition_project', {
    p_project_id: projectId,
    p_expected_status: expectedStatus,
    p_target_status: targetStatus,
  });

  if (!rpcError && rpcData) {
    const row = (Array.isArray(rpcData) ? rpcData[0] : rpcData) as ProjectRow;
    await recordStudioActivity(supabase, {
      actorProfileId,
      action:
        targetStatus === 'archived'
          ? 'project.archived'
          : expectedStatus === 'archived'
            ? 'project.restored'
            : 'project.status_changed',
      clientId: row.client_id,
      projectId,
      subjectType: 'project',
      subjectId: projectId,
      metadata: { from: expectedStatus, to: targetStatus },
    });
    return row;
  }

  if (rpcError) {
    const message = `${rpcError.message ?? ''} ${rpcError.code ?? ''} ${rpcError.details ?? ''}`;
    if (/conflict|40001|serialization/i.test(message)) {
      throw new ProjectMutationError('conflict', PROJECT_TRANSITION_CONFLICT_ERROR);
    }
    if (/invalid project transition|22023/i.test(message)) {
      throw new ProjectMutationError('invalid', 'That status change is not allowed.');
    }
    if (!/function|does not exist|PGRST202|42883/i.test(message)) {
      throw new ProjectMutationError('failed', 'Unable to update project status.');
    }
    // Fall through only when RPC is missing (pre-migration environments).
  }

  // Fallback path if RPC not yet migrated in an environment.
  const { data: existing, error: loadError } = await supabase
    .from('projects')
    .select('id, status, client_id')
    .eq('id', projectId)
    .maybeSingle();
  if (loadError) throw new ProjectMutationError('failed', 'Unable to update project status.');
  if (!existing) throw new ProjectMutationError('not_found', 'Project not found.');
  if (existing.status !== expectedStatus) {
    throw new ProjectMutationError('conflict', PROJECT_TRANSITION_CONFLICT_ERROR);
  }

  const { data, error } = await supabase
    .from('projects')
    .update(patch)
    .eq('id', projectId)
    .eq('status', expectedStatus)
    .select('*')
    .maybeSingle();

  if (error) throw new ProjectMutationError('failed', 'Unable to update project status.');
  if (!data) {
    throw new ProjectMutationError('conflict', PROJECT_TRANSITION_CONFLICT_ERROR);
  }

  await recordStudioActivity(supabase, {
    actorProfileId,
    action:
      targetStatus === 'archived'
        ? 'project.archived'
        : expectedStatus === 'archived'
          ? 'project.restored'
          : 'project.status_changed',
    clientId: data.client_id,
    projectId,
    subjectType: 'project',
    subjectId: projectId,
    metadata: { from: expectedStatus, to: targetStatus },
  });

  return data;
}

export async function archiveProject(
  supabase: StudioSupabaseClient,
  projectId: string,
  expectedStatus: ProjectStatus,
  actorProfileId: string | null,
): Promise<ProjectRow> {
  return transitionProject(supabase, projectId, expectedStatus, 'archived', actorProfileId);
}

export async function restoreProject(
  supabase: StudioSupabaseClient,
  projectId: string,
  actorProfileId: string | null,
): Promise<ProjectRow> {
  // Documented restore: archived → inquiry (neutral). status_before_archive is recorded for audit.
  return transitionProject(supabase, projectId, 'archived', 'inquiry', actorProfileId);
}

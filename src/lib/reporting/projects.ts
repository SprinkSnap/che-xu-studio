/**
 * Project + proposal operational reporting queries.
 */

import type { StudioSupabaseClient } from '../supabase/types';
import { PROJECT_STATUS_LABELS, type ProjectStatus } from '../projects/workflow';
import { diffCalendarDays, addCalendarDays } from '../reminders/dates';
import {
  ACTIVE_PROJECT_STATUSES,
  AWAITING_APPROVAL_PROPOSAL_STATUSES,
  CHANGES_REQUESTED_PROPOSAL_STATUSES,
  DEADLINE_LOOKAHEAD_DAYS,
  DEADLINE_LIST_LIMIT,
} from './definitions';
import type { DeadlineRow, MetricAvailability, ProjectMetrics, ProposalMetrics } from './types';

export async function loadProjectMetrics(client: StudioSupabaseClient): Promise<ProjectMetrics> {
  try {
    const { count, error } = await client
      .from('projects')
      .select('id', { count: 'exact', head: true })
      .in('status', [...ACTIVE_PROJECT_STATUSES]);
    if (error) throw error;
    return { availability: 'ok', activeCount: count ?? 0 };
  } catch (error) {
    console.error('[reporting] projects failed', error instanceof Error ? error.message : 'error');
    return { availability: 'unavailable', activeCount: 0 };
  }
}

export async function loadProposalMetrics(client: StudioSupabaseClient): Promise<ProposalMetrics> {
  try {
    const [awaiting, changes] = await Promise.all([
      client
        .from('proposals')
        .select('id', { count: 'exact', head: true })
        .in('status', [...AWAITING_APPROVAL_PROPOSAL_STATUSES]),
      client
        .from('proposals')
        .select('id', { count: 'exact', head: true })
        .in('status', [...CHANGES_REQUESTED_PROPOSAL_STATUSES]),
    ]);
    if (awaiting.error) throw awaiting.error;
    if (changes.error) throw changes.error;
    return {
      availability: 'ok',
      awaitingApprovalCount: awaiting.count ?? 0,
      changesRequestedCount: changes.count ?? 0,
    };
  } catch (error) {
    console.error('[reporting] proposals failed', error instanceof Error ? error.message : 'error');
    return {
      availability: 'unavailable',
      awaitingApprovalCount: 0,
      changesRequestedCount: 0,
    };
  }
}

export async function loadUpcomingDeadlines(
  client: StudioSupabaseClient,
  businessToday: string,
): Promise<{ availability: MetricAvailability; items: DeadlineRow[]; pastTargetCount: number }> {
  try {
    const windowEnd = addCalendarDays(businessToday, DEADLINE_LOOKAHEAD_DAYS);
    const { data, error } = await client
      .from('projects')
      .select('id, name, status, target_completion_date, client_id, clients(company_name, display_name)')
      .not('target_completion_date', 'is', null)
      .neq('status', 'completed')
      .neq('status', 'archived')
      .lte('target_completion_date', windowEnd)
      .order('target_completion_date', { ascending: true })
      .limit(DEADLINE_LIST_LIMIT);
    if (error) throw error;

    const items: DeadlineRow[] = (data ?? []).map((row) => {
      const clientRel = row.clients as
        | { company_name?: string; display_name?: string | null }
        | { company_name?: string; display_name?: string | null }[]
        | null;
      const client = Array.isArray(clientRel) ? clientRel[0] : clientRel;
      const target = row.target_completion_date as string;
      const daysUntil = diffCalendarDays(businessToday, target);
      const status = row.status as ProjectStatus;
      return {
        projectId: row.id,
        projectName: row.name,
        clientId: row.client_id,
        clientName: client?.display_name || client?.company_name || 'Client',
        status,
        statusLabel: PROJECT_STATUS_LABELS[status] ?? status,
        targetCompletionDate: target,
        daysUntil,
        pastTarget: daysUntil < 0,
      };
    });

    // Also count all past-target open projects (for attention), not just list window.
    const { count: pastCount } = await client
      .from('projects')
      .select('id', { count: 'exact', head: true })
      .not('target_completion_date', 'is', null)
      .neq('status', 'completed')
      .neq('status', 'archived')
      .lt('target_completion_date', businessToday);

    return {
      availability: 'ok',
      items,
      pastTargetCount: pastCount ?? items.filter((i) => i.pastTarget).length,
    };
  } catch (error) {
    console.error('[reporting] deadlines failed', error instanceof Error ? error.message : 'error');
    return { availability: 'unavailable', items: [], pastTargetCount: 0 };
  }
}

import { describe, expect, it } from 'vitest';
import { parseMajorToMinor, percentInputToBps, bpsToPercentInput } from '../../src/lib/money/parse';
import {
  createProjectSchema,
  projectListQuerySchema,
  transitionProjectSchema,
  uuidParamSchema,
} from '../../src/lib/projects/validation';
import {
  canTransitionProject,
  getAllowedProjectTransitions,
  PROJECT_STATUSES,
  transitionSideEffects,
  type ProjectStatus,
} from '../../src/lib/projects/workflow';
import { depositPreview } from '../../src/lib/projects/form-values';
import { roleHasPermission } from '../../src/lib/auth/permissions';
import { humanizeStudioActivity } from '../../src/lib/studio/activity';
import { formatDateOnly } from '../../src/lib/clients/format';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const validCreate = {
  name: 'Brand refresh',
  clientId: '11111111-1111-4111-8111-111111111111',
  projectType: 'Brand Identity',
  description: 'Summary',
  scope: 'Logo system',
  deliverables: 'Guidelines PDF',
  startDate: '2026-08-01',
  targetCompletionDate: '2026-09-01',
  projectPrice: '8000.00',
  currency: 'CAD',
  taxPercent: '13',
  depositPercent: '50',
  internalNotes: 'Private',
};

describe('money parse', () => {
  it('parses major units into minor units', () => {
    expect(parseMajorToMinor('8000', 'CAD')).toEqual({ ok: true, minor: 800000 });
    expect(parseMajorToMinor('8000.00', 'CAD')).toEqual({ ok: true, minor: 800000 });
    expect(parseMajorToMinor('8000.5', 'CAD')).toEqual({ ok: true, minor: 800050 });
  });

  it('rejects malformed or over-precise values', () => {
    expect(parseMajorToMinor('12.345', 'CAD').ok).toBe(false);
    expect(parseMajorToMinor('abc', 'CAD').ok).toBe(false);
    expect(parseMajorToMinor('-10', 'CAD').ok).toBe(false);
  });

  it('converts percent inputs to basis points', () => {
    expect(percentInputToBps('13')).toEqual({ ok: true, bps: 1300 });
    expect(percentInputToBps('50')).toEqual({ ok: true, bps: 5000 });
    expect(bpsToPercentInput(1300)).toBe('13');
    expect(bpsToPercentInput(5050)).toBe('50.5');
  });
});

describe('project validation', () => {
  it('accepts a valid create payload', () => {
    const parsed = createProjectSchema.safeParse(validCreate);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.projectPriceMinor).toBe(800000);
      expect(parsed.data.taxBps).toBe(1300);
      expect(parsed.data.depositBps).toBe(5000);
    }
  });

  it('rejects empty name and invalid client UUID', () => {
    expect(createProjectSchema.safeParse({ ...validCreate, name: ' ' }).success).toBe(false);
    expect(
      createProjectSchema.safeParse({ ...validCreate, clientId: 'not-a-uuid' }).success,
    ).toBe(false);
  });

  it('rejects invalid currency, negative price, and bad tax/deposit', () => {
    expect(createProjectSchema.safeParse({ ...validCreate, currency: 'EUR' }).success).toBe(
      false,
    );
    expect(createProjectSchema.safeParse({ ...validCreate, projectPrice: '-1' }).success).toBe(
      false,
    );
    expect(createProjectSchema.safeParse({ ...validCreate, taxPercent: '-1' }).success).toBe(
      false,
    );
    expect(createProjectSchema.safeParse({ ...validCreate, depositPercent: '-5' }).success).toBe(
      false,
    );
    expect(createProjectSchema.safeParse({ ...validCreate, depositPercent: '101' }).success).toBe(
      false,
    );
  });

  it('rejects completion before start', () => {
    expect(
      createProjectSchema.safeParse({
        ...validCreate,
        startDate: '2026-09-01',
        targetCompletionDate: '2026-08-01',
      }).success,
    ).toBe(false);
  });

  it('whitelists list sort/status and uuid params', () => {
    const parsed = projectListQuerySchema.parse({
      q: '  brand ',
      status: 'active',
      sort: 'value_desc',
      page: '2',
    });
    expect(parsed.q).toBe('brand');
    expect(parsed.sort).toBe('value_desc');
    expect(projectListQuerySchema.safeParse({ sort: 'drop table' }).success).toBe(false);
    expect(uuidParamSchema.safeParse('11111111-1111-4111-8111-111111111111').success).toBe(true);
    expect(transitionProjectSchema.safeParse({ expectedStatus: 'inquiry', targetStatus: 'proposal' })
      .success).toBe(true);
    expect(
      transitionProjectSchema.safeParse({ expectedStatus: 'inquiry', targetStatus: 'completed' })
        .success,
    ).toBe(true); // schema allows enum members; workflow enforces graph
  });
});

describe('project workflow', () => {
  it('allows every documented transition', () => {
    const expected: Record<ProjectStatus, ProjectStatus[]> = {
      inquiry: ['proposal', 'archived'],
      proposal: ['awaiting_approval', 'deposit_due', 'inquiry', 'archived'],
      awaiting_approval: ['deposit_due', 'proposal', 'archived'],
      deposit_due: ['active', 'archived'],
      active: ['awaiting_final_payment', 'archived'],
      awaiting_final_payment: ['completed', 'active', 'archived'],
      completed: ['archived'],
      archived: ['inquiry'],
    };
    for (const status of PROJECT_STATUSES) {
      expect([...getAllowedProjectTransitions(status)]).toEqual(expected[status]);
    }
  });

  it('rejects representative forbidden transitions', () => {
    expect(canTransitionProject('inquiry', 'completed')).toBe(false);
    expect(canTransitionProject('deposit_due', 'proposal')).toBe(false);
    expect(canTransitionProject('completed', 'active')).toBe(false);
  });

  it('sets completed_at and archived_at side effects', () => {
    const completed = transitionSideEffects('awaiting_final_payment', 'completed', '2026-08-14T12:00:00.000Z');
    expect(completed.completed_at).toBe('2026-08-14T12:00:00.000Z');
    const archived = transitionSideEffects('active', 'archived', '2026-08-14T12:00:00.000Z');
    expect(archived.archived_at).toBe('2026-08-14T12:00:00.000Z');
    expect(archived.status_before_archive).toBe('active');
    const restored = transitionSideEffects('archived', 'inquiry');
    expect(restored.archived_at).toBeNull();
  });
});

describe('project helpers', () => {
  it('computes deposit preview with integer truncation', () => {
    expect(depositPreview(800_000, 5_000)).toEqual({
      depositBaseMinor: 400_000,
      remainingMinor: 400_000,
    });
    expect(depositPreview(100, 3333)).toEqual({
      depositBaseMinor: 33,
      remainingMinor: 67,
    });
  });

  it('formats date-only values without timezone shift', () => {
    expect(formatDateOnly('2026-08-14')).toMatch(/Aug/);
    expect(formatDateOnly(null)).toBe('—');
  });

  it('maps project permissions and activity labels', () => {
    expect(roleHasPermission('staff', 'studio.projects.read')).toBe(true);
    expect(roleHasPermission('staff', 'studio.projects.write')).toBe(true);
    expect(humanizeStudioActivity('project.status_changed')).toBe('Project status changed');
  });

  it('ships workflow helper migration', () => {
    const dir = path.join(process.cwd(), 'supabase/migrations');
    const files = readdirSync(dir);
    expect(files.some((f) => f.includes('project_workflow_helpers'))).toBe(true);
    const sql = readFileSync(
      path.join(dir, files.find((f) => f.includes('project_workflow_helpers'))!),
      'utf8',
    );
    expect(sql).toContain('transition_project');
    expect(sql).toContain('status_before_archive');
    expect(sql).toContain('SECURITY INVOKER');
  });
});

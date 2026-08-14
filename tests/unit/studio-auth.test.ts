import { describe, expect, it, vi } from 'vitest';
import {
  isActiveStudioStatus,
  permissionsForRole,
  roleHasPermission,
} from '../../src/lib/auth/permissions';
import { loginUrl, safeStudioRedirect } from '../../src/lib/auth/redirects';
import {
  assertActiveStudioMembership,
  assertStudioPermission,
  toStudioAuthContext,
} from '../../src/lib/auth/studio-context';
import { isStudioProtectedAdminPath, isStudioPublicAuthPath } from '../../src/lib/auth/types';
import { resolveStudioBaseUrl, studioResetPasswordUrl } from '../../src/lib/auth/studio-url';
import { StudioAuthError, requireStudioAdmin } from '../../src/lib/supabase/auth';
import {
  GENERIC_LOGIN_ERROR,
  loginSchema,
  resetPasswordSchema,
} from '../../src/lib/auth/validation';

describe('studio permissions', () => {
  it('maps owner and admin to full access and staff to a subset', () => {
    expect(roleHasPermission('owner', 'studio.settings.manage')).toBe(true);
    expect(roleHasPermission('admin', 'studio.users.manage')).toBe(true);
    expect(roleHasPermission('staff', 'studio.clients.write')).toBe(true);
    expect(roleHasPermission('staff', 'studio.settings.manage')).toBe(false);
    expect(permissionsForRole('staff')).not.toContain('studio.users.manage');
  });

  it('treats only active status as membership-ready', () => {
    expect(isActiveStudioStatus('active')).toBe(true);
    expect(isActiveStudioStatus('suspended')).toBe(false);
  });
});

describe('safeStudioRedirect', () => {
  it('allows internal studio paths and rejects open redirects', () => {
    expect(safeStudioRedirect('/admin/invoices')).toBe('/admin/invoices');
    expect(safeStudioRedirect('/admin/clients?q=1')).toBe('/admin/clients?q=1');
    expect(safeStudioRedirect('https://evil.example')).toBe('/admin');
    expect(safeStudioRedirect('//evil.example')).toBe('/admin');
    expect(safeStudioRedirect('javascript:alert(1)')).toBe('/admin');
    expect(safeStudioRedirect('/login')).toBe('/admin');
    expect(safeStudioRedirect('/admin/login')).toBe('/admin');
    expect(loginUrl('/admin/projects')).toContain('next=');
  });
});

describe('studio auth path classification', () => {
  it('marks login and recovery public and dashboard protected', () => {
    expect(isStudioPublicAuthPath('/admin/login')).toBe(true);
    expect(isStudioPublicAuthPath('/admin/forgot-password')).toBe(true);
    expect(isStudioProtectedAdminPath('/admin')).toBe(true);
    expect(isStudioProtectedAdminPath('/admin/clients')).toBe(true);
    expect(isStudioProtectedAdminPath('/admin/login')).toBe(false);
  });
});

describe('membership assertions', () => {
  const profile = {
    id: 'p1',
    auth_user_id: 'u1',
    display_name: 'Owner',
    email: 'owner@chexustudio.com',
    role: 'owner' as const,
    status: 'active' as const,
  };

  it('requires an active profile', () => {
    expect(() => assertActiveStudioMembership(null)).toThrow(StudioAuthError);
    expect(() =>
      assertActiveStudioMembership({ ...profile, status: 'suspended' }),
    ).toThrow(StudioAuthError);
    expect(assertActiveStudioMembership(profile).id).toBe('p1');
  });

  it('enforces permissions for a context', () => {
    const context = toStudioAuthContext(
      { id: 'u1', email: 'owner@chexustudio.com' },
      profile,
    );
    expect(() => assertStudioPermission(context, 'studio.dashboard.view')).not.toThrow();
    const staffContext = toStudioAuthContext(
      { id: 'u2', email: 'staff@chexustudio.com' },
      { ...profile, id: 'p2', role: 'staff', email: 'staff@chexustudio.com' },
    );
    expect(() => assertStudioPermission(staffContext, 'studio.settings.manage')).toThrow(
      StudioAuthError,
    );
  });
});

describe('auth validation messaging', () => {
  it('rejects invalid login payloads without leaking details', () => {
    const parsed = loginSchema.safeParse({ email: 'not-an-email', password: '' });
    expect(parsed.success).toBe(false);
    expect(GENERIC_LOGIN_ERROR).toMatch(/Unable to sign in/i);
  });

  it('requires matching passwords with a minimum length', () => {
    expect(
      resetPasswordSchema.safeParse({ password: 'short', confirmPassword: 'short' }).success,
    ).toBe(false);
    expect(
      resetPasswordSchema.safeParse({
        password: 'long-enough',
        confirmPassword: 'different',
      }).success,
    ).toBe(false);
    expect(
      resetPasswordSchema.safeParse({
        password: 'long-enough',
        confirmPassword: 'long-enough',
      }).success,
    ).toBe(true);
  });
});

describe('studio base URL', () => {
  it('builds reset URLs on the Studio origin', () => {
    expect(resolveStudioBaseUrl({ STUDIO_BASE_URL: 'https://studio.chexustudio.com' })).toBe(
      'https://studio.chexustudio.com',
    );
    expect(studioResetPasswordUrl('https://studio.chexustudio.com')).toBe(
      'https://studio.chexustudio.com/admin/reset-password',
    );
  });
});

describe('requireStudioAdmin membership', () => {
  it('rejects authenticated users without an active Studio profile', async () => {
    const client = {
      auth: {
        getUser: vi.fn(async () => ({
          data: {
            user: {
              id: 'user-1',
              email: 'outsider@example.com',
              aud: 'authenticated',
              role: 'authenticated',
              created_at: '2026-01-01T00:00:00.000Z',
            },
          },
          error: null,
        })),
      },
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          })),
        })),
      })),
    };

    await expect(requireStudioAdmin(client as never)).rejects.toBeInstanceOf(StudioAuthError);
    await expect(requireStudioAdmin(client as never)).rejects.toMatchObject({
      code: 'forbidden',
    });
  });

  it('accepts an active owner profile', async () => {
    const client = {
      auth: {
        getUser: vi.fn(async () => ({
          data: {
            user: {
              id: 'user-owner',
              email: 'owner@chexustudio.com',
              aud: 'authenticated',
              role: 'authenticated',
              created_at: '2026-01-01T00:00:00.000Z',
            },
          },
          error: null,
        })),
      },
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: {
                id: 'profile-1',
                auth_user_id: 'user-owner',
                role: 'owner',
                status: 'active',
                display_name: 'Owner',
                email: 'owner@chexustudio.com',
              },
              error: null,
            })),
          })),
        })),
      })),
    };

    await expect(requireStudioAdmin(client as never)).resolves.toMatchObject({
      id: 'user-owner',
      email: 'owner@chexustudio.com',
    });
  });
});

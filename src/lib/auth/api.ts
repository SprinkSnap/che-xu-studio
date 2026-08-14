/**
 * API authorization helpers for future /api/studio/* endpoints.
 * Page middleware does not protect APIs automatically.
 */

import type { APIContext } from 'astro';
import type { StudioPermission } from '../auth/permissions';
import {
  requireStudioPermission,
  requireStudioUser,
  studioAuthErrorResponse,
} from '../auth/require';
import type { StudioAuthContext } from '../auth/studio-context';

export async function authorizeStudioApi(
  context: APIContext,
  permission?: StudioPermission,
): Promise<StudioAuthContext | Response> {
  try {
    if (permission) {
      return await requireStudioPermission(context, permission);
    }
    return await requireStudioUser(context);
  } catch (error) {
    const response = studioAuthErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

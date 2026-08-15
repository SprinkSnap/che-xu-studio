/**
 * Scheduled Studio jobs — outbox retry + payment reminders.
 * Auth: Authorization: Bearer <CRON_SECRET> (or x-cron-secret).
 * Never expose as an unauthenticated endpoint.
 */

import type { APIRoute } from 'astro';
import { jsonOk, jsonError } from '../../../../lib/security';
import { tryCreateSupabaseServiceClient } from '../../../../lib/supabase/server';
import {
  readStudioEmailEnvFromRuntime,
  resolveStudioEmailEnv,
} from '../../../../lib/email/config';
import { processStudioJobs } from '../../../../lib/email/process';

export const prerender = false;

function extractCronSecret(request: Request): string {
  const auth = request.headers.get('authorization') ?? '';
  const bearer = auth.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? '';
  if (bearer) return bearer;
  return (request.headers.get('x-cron-secret') ?? '').trim();
}

export const POST: APIRoute = async ({ request }) => {
  const emailEnv = await readStudioEmailEnvFromRuntime();
  const expected = (emailEnv.CRON_SECRET ?? '').trim();
  if (!expected) {
    return jsonError('Not found', 404);
  }

  const provided = extractCronSecret(request);
  if (!provided || provided !== expected) {
    return jsonError('Unauthorized', 401);
  }

  const service = tryCreateSupabaseServiceClient();
  if (!service) {
    return jsonError('Service unavailable', 503);
  }

  try {
    const result = await processStudioJobs(service, resolveStudioEmailEnv(emailEnv));
    return jsonOk(
      {
        ok: true,
        outbox: result.outbox,
        reminders: result.reminders,
      },
      200,
      {
        'Cache-Control': 'private, no-store',
        'X-Robots-Tag': 'noindex, nofollow, noarchive',
      },
    );
  } catch {
    return jsonError('Job processing failed', 500);
  }
};

export const GET: APIRoute = async () => jsonError('Method not allowed', 405);

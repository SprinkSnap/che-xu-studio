/**
 * Studio client-delivery send dispatcher.
 * Prefers Microsoft Graph (M365) when configured; otherwise Resend.
 */

import { resolveStudioEmailEnv, resolveStudioEmailTransport, type StudioEmailEnvSource } from './config';
import { sendViaResend } from './client';
import { sendViaMicrosoftGraph } from './graph-client';
import type { SendEmailInput, SendEmailResult } from './types';

export async function sendStudioEmail(
  input: SendEmailInput,
  env?: StudioEmailEnvSource,
): Promise<SendEmailResult & { transport: 'graph' | 'resend' }> {
  const resolved = env ?? resolveStudioEmailEnv();
  const transport = resolveStudioEmailTransport(resolved);

  if (transport === 'graph') {
    const result = await sendViaMicrosoftGraph(input, resolved);
    return { ...result, transport: 'graph' };
  }

  const result = await sendViaResend(input, resolved);
  return { ...result, transport: 'resend' };
}

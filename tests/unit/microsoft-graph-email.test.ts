import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearGraphTokenCacheForTests,
  isMicrosoftGraphConfigured,
  sendViaMicrosoftGraph,
} from '../../src/lib/email/graph-client';
import { resolveStudioEmailTransport } from '../../src/lib/email/config';
import { sendStudioEmail } from '../../src/lib/email/send';

describe('Microsoft Graph email', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    clearGraphTokenCacheForTests();
  });

  it('detects configuration and prefers graph transport', () => {
    const env = {
      MICROSOFT_GRAPH_TENANT_ID: 'tenant',
      MICROSOFT_GRAPH_CLIENT_ID: 'client',
      MICROSOFT_GRAPH_CLIENT_SECRET: 'secret',
      CONTACT_FROM_EMAIL: 'Che Xu Studio <info@chexustudio.com>',
    };
    expect(isMicrosoftGraphConfigured(env)).toBe(true);
    expect(resolveStudioEmailTransport(env)).toBe('graph');
    expect(resolveStudioEmailTransport({ ...env, STUDIO_EMAIL_TRANSPORT: 'resend' })).toBe(
      'resend',
    );
  });

  it('sends via Graph token + sendMail', async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      async (input) => {
        const url = String(input);
        if (url.includes('oauth2/v2.0/token')) {
          return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), {
            status: 200,
          });
        }
        if (url.includes('/sendMail')) {
          return new Response(null, { status: 202 });
        }
        return new Response('unexpected', { status: 500 });
      },
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendViaMicrosoftGraph(
      {
        to: 'client@hotmail.com',
        subject: 'Your invoice',
        html: '<p>Hi</p>',
        text: 'Hi',
        bcc: 'info@chexustudio.com',
        headers: { 'X-Entity-Ref-ID': 'invoice:1', 'Auto-Submitted': 'auto-generated' },
      },
      {
        MICROSOFT_GRAPH_TENANT_ID: 'tenant',
        MICROSOFT_GRAPH_CLIENT_ID: 'client',
        MICROSOFT_GRAPH_CLIENT_SECRET: 'secret',
        MICROSOFT_GRAPH_MAILBOX: 'info@chexustudio.com',
        CONTACT_FROM_EMAIL: 'Che Xu Studio <info@chexustudio.com>',
      },
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.providerMessageId.startsWith('graph:')).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const sendBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(sendBody.message.toRecipients[0].emailAddress.address).toBe('client@hotmail.com');
    expect(sendBody.message.internetMessageHeaders).toEqual([
      { name: 'X-Entity-Ref-ID', value: 'invoice:1' },
    ]);
    expect(sendBody.saveToSentItems).toBe(true);
  });

  it('dispatcher uses Graph when configured', async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      async (input) => {
        const url = String(input);
        if (url.includes('oauth2/v2.0/token')) {
          return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), {
            status: 200,
          });
        }
        return new Response(null, { status: 202 });
      },
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendStudioEmail(
      { to: 'a@b.com', subject: 'S', html: '<p>x</p>', text: 'x' },
      {
        MICROSOFT_GRAPH_TENANT_ID: 't',
        MICROSOFT_GRAPH_CLIENT_ID: 'c',
        MICROSOFT_GRAPH_CLIENT_SECRET: 's',
        CONTACT_FROM_EMAIL: 'Che Xu Studio <info@chexustudio.com>',
      },
    );
    expect(result.transport).toBe('graph');
    expect(result.ok).toBe(true);
  });
});

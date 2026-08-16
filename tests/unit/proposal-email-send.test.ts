import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendViaResend } from '../../src/lib/email/client';
import { isValidEmail, resolveDeliveryRecipient } from '../../src/lib/email/resolve-recipient';

describe('resolveDeliveryRecipient', () => {
  it('validates email shape', () => {
    expect(isValidEmail('client@example.com')).toBe(true);
    expect(isValidEmail('not-an-email')).toBe(false);
  });

  it('prefers override, then snapshot, then billing, then primary contact', async () => {
    const calls: string[] = [];
    const supabase = {
      from(table: string) {
        calls.push(table);
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          maybeSingle: async () => {
            if (table === 'clients') {
              return { data: { billing_email: 'billing@example.com' } };
            }
            if (table === 'client_contacts') {
              return { data: { email: 'primary@example.com' } };
            }
            return { data: null };
          },
        };
      },
    };

    const override = await resolveDeliveryRecipient(supabase as never, {
      recipientEmail: 'Override@Example.com',
      snapshotEmail: 'snapshot@example.com',
      clientId: 'c1',
    });
    expect(override).toBe('override@example.com');
    expect(calls).toEqual([]);

    const snapshot = await resolveDeliveryRecipient(supabase as never, {
      recipientEmail: null,
      snapshotEmail: 'Snapshot@Example.com',
      clientId: 'c1',
    });
    expect(snapshot).toBe('snapshot@example.com');
    expect(calls).toEqual([]);

    const billing = await resolveDeliveryRecipient(supabase as never, {
      recipientEmail: null,
      snapshotEmail: null,
      clientId: 'c1',
    });
    expect(billing).toBe('billing@example.com');
    expect(calls).toContain('clients');
  });
});

describe('sendViaResend payload', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('does not send an invalid per-message tracking object', async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      async () =>
        new Response(JSON.stringify({ id: 'msg_123' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendViaResend(
      {
        to: 'client@example.com',
        subject: 'Test',
        html: '<p>Hi</p>',
        text: 'Hi',
        disableTracking: true,
        bcc: 'info@chexustudio.com',
        idempotencyKey: 'proposal:v1:resend:1',
      },
      {
        RESEND_API_KEY: 're_test',
        CONTACT_FROM_EMAIL: 'Che Xu Studio <info@chexustudio.com>',
      },
    );

    expect(result.ok).toBe(true);
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.to).toEqual(['client@example.com']);
    expect(body.bcc).toEqual(['info@chexustudio.com']);
    expect(body.from).toContain('info@chexustudio.com');
    expect(body.tracking).toBeUndefined();
  });

  it('forwards transactional headers to Resend', async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      async () =>
        new Response(JSON.stringify({ id: 'msg_headers' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await sendViaResend(
      {
        to: 'client@hotmail.com',
        subject: 'Test',
        html: '<p>Hi</p>',
        text: 'Hi',
        headers: {
          'Auto-Submitted': 'auto-generated',
          'X-Entity-Ref-ID': 'invoice:1',
        },
      },
      {
        RESEND_API_KEY: 're_test',
        CONTACT_FROM_EMAIL: 'Che Xu Studio <info@chexustudio.com>',
      },
    );

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.headers['Auto-Submitted']).toBe('auto-generated');
    expect(body.headers['X-Entity-Ref-ID']).toBe('invoice:1');
  });
});

describe('Microsoft consumer mailbox detection', () => {
  it('flags hotmail/outlook consumer hosts', async () => {
    const { isMicrosoftConsumerMailbox, transactionalDeliveryHeaders } = await import(
      '../../src/lib/email/deliverability'
    );
    expect(isMicrosoftConsumerMailbox('a@hotmail.com')).toBe(true);
    expect(isMicrosoftConsumerMailbox('a@outlook.com')).toBe(true);
    expect(isMicrosoftConsumerMailbox('a@gmail.com')).toBe(false);
    expect(transactionalDeliveryHeaders('invoice:abc')['Auto-Submitted']).toBe('auto-generated');
  });
});

describe('sendProposalEmail already-delivered behavior', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('delegates to resend instead of returning a silent already_sent no-op', async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      async () =>
        new Response(JSON.stringify({ id: `msg_${fetchMock.mock.calls.length}` }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const emailLogs = new Map<string, { id: string; status: string }>([
      ['proposal:v1:delivery', { id: 'log-existing', status: 'sent' }],
    ]);

    function from(table: string) {
      const state: Record<string, unknown> = { table, filters: {} as Record<string, string> };
      const api = {
        select() {
          return api;
        },
        insert(row: Record<string, unknown>) {
          state.insert = row;
          return api;
        },
        update(row: Record<string, unknown>) {
          state.update = row;
          return api;
        },
        eq(column: string, value: string) {
          (state.filters as Record<string, string>)[column] = value;
          return api;
        },
        in() {
          return api;
        },
        is() {
          return api;
        },
        maybeSingle: async () => {
          if (table === 'proposals') {
            return {
              data: {
                id: 'p1',
                status: 'expired',
                title: 'Website',
                proposal_number: 'CXS-P-1',
                expires_at: '2026-01-01T00:00:00Z',
                sent_at: '2025-12-01T00:00:00Z',
                accepted_at: null,
                client_id: 'c1',
                project_id: 'proj1',
                current_version_id: 'v1',
              },
            };
          }
          if (table === 'proposal_versions') {
            return {
              data: {
                id: 'v1',
                version_number: 1,
                title: 'Website',
                is_immutable: true,
                total_minor: 10000,
                currency: 'CAD',
                client_contact_name: 'Alex',
                client_contact_email: 'client@example.com',
                project_name: 'Website',
                finalized_at: '2025-11-01T00:00:00Z',
              },
            };
          }
          if (table === 'email_logs') {
            const key = (state.filters as Record<string, string>).idempotency_key;
            return { data: key ? emailLogs.get(key) ?? null : null };
          }
          if (table === 'public_links') {
            return { data: [] };
          }
          if (table === 'projects') {
            return { data: { id: 'proj1', status: 'awaiting_approval' } };
          }
          if (table === 'clients' || table === 'client_contacts') {
            return { data: null };
          }
          return { data: null };
        },
        single: async () => {
          if (table === 'email_logs' && state.insert) {
            const key = String((state.insert as { idempotency_key: string }).idempotency_key);
            if (emailLogs.has(key)) {
              return { data: null, error: { message: 'duplicate', code: '23505' } };
            }
            const id = `log-${emailLogs.size + 1}`;
            emailLogs.set(key, { id, status: 'queued' });
            return { data: { id, status: 'queued' }, error: null };
          }
          if (table === 'public_links') {
            return {
              data: { id: 'link1', expires_at: null },
              error: null,
            };
          }
          return { data: null, error: { message: 'unexpected' } };
        },
      };
      return api;
    }

    const supabase = { from };

    vi.doMock('../../src/lib/pdf/attachments', () => ({
      maybeProposalPdfAttachment: async () => null,
    }));
    vi.doMock('../../src/lib/pdf/filenames', () => ({
      proposalPdfFilename: () => 'proposal.pdf',
    }));
    vi.doMock('../../src/lib/studio/activity', () => ({
      recordStudioActivity: async () => undefined,
    }));
    vi.doMock('../../src/lib/public-links/tokens', async () => {
      const actual = await vi.importActual<typeof import('../../src/lib/public-links/tokens')>(
        '../../src/lib/public-links/tokens',
      );
      return actual;
    });

    const { sendProposalEmail } = await import('../../src/lib/email/proposal-send');
    const result = await sendProposalEmail(supabase as never, {
      proposalId: 'p1',
      actorProfileId: 'actor1',
      recipientEmail: 'client@example.com',
      emailEnv: {
        RESEND_API_KEY: 're_test',
        CONTACT_FROM_EMAIL: 'Che Xu Studio <info@chexustudio.com>',
        PUBLIC_SITE_URL: 'https://chexustudio.com',
      },
    });

    expect(result.alreadySent).toBe(false);
    expect(result.recipientEmail).toBe('client@example.com');
    expect(fetchMock).toHaveBeenCalled();
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.to).toEqual(['client@example.com']);
    expect(body.html).toContain('/proposal/');
  });
});

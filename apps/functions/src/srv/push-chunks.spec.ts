import { beforeEach, describe, expect, it, vi } from 'vitest';

// pushToPersons sends in chunks of 500 (the FCM limit per sendEach). A stale-token result maps back
// by its index INTO THE CHUNK; a global index would delete the wrong device's token (final review,
// deferred item 6). Own file: the Firestore and Messaging mocks would leak into push.spec.ts.

const TOKENS = vi.hoisted(() => 501);

const fx = vi.hoisted(() => ({
  deleted: [] as string[],
  sendEach: vi.fn(),
}));

vi.mock('firebase-functions/v2', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

vi.mock('../badge/ledger', () => ({ readBadgeSums: async () => new Map<string, number | undefined>() }));

vi.mock('firebase-admin/messaging', () => ({ getMessaging: () => ({ sendEach: fx.sendEach }) }));

vi.mock('firebase-admin/firestore', () => {
  const tokenDocs = Array.from({ length: TOKENS }, (_, i) => ({
    id: `d${i}`,
    data: () => ({ token: `t${i}`, platform: 'web' }),
  }));
  const db = {
    collection: (name: string) => ({
      where: () => ({
        get: async () => ({ docs: [{ id: 'u1', data: () => ({ tenants: ['scs'], isArchived: false, roles: { registered: true } }) }] }),
      }),
      doc: (id: string) => ({
        get: async () => ({ data: () => (name === 'app-config' ? { appName: 'SCS' } : undefined) }),
        collection: () => ({
          get: async () => ({ docs: tokenDocs }),
          doc: (docId: string) => ({
            delete: async () => { fx.deleted.push(`${id}/${docId}`); },
          }),
        }),
      }),
    }),
  };
  return { getFirestore: () => db };
});

import { pushToPersons } from './push';

describe('pushToPersons chunks', () => {
  beforeEach(() => {
    fx.deleted = [];
    fx.sendEach.mockReset();
  });

  it('deletes exactly the stale token of the second chunk', async () => {
    fx.sendEach
      .mockImplementationOnce(async (messages: unknown[]) => ({
        successCount: messages.length, failureCount: 0, responses: messages.map(() => ({ success: true })),
      }))
      .mockImplementationOnce(async (messages: unknown[]) => ({
        successCount: 0,
        failureCount: messages.length,
        responses: messages.map(() => ({ success: false, error: { code: 'messaging/registration-token-not-registered' } })),
      }));

    const result = await pushToPersons(['p'], { type: 'calevent', tenantId: 'scs', title: 'T', body: 'B', url: '/x' }, 'test');

    expect(fx.sendEach).toHaveBeenCalledTimes(2);
    expect(fx.sendEach.mock.calls[0][0]).toHaveLength(500);
    expect(fx.sendEach.mock.calls[1][0]).toHaveLength(1);
    expect(fx.deleted).toEqual(['u1/d500']);
    expect(result).toEqual({ recipients: TOKENS, sent: 500, failed: 1 });
  });

  it('a failing chunk does not stop the next one', async () => {
    fx.sendEach
      .mockRejectedValueOnce(new Error('boom'))
      .mockImplementationOnce(async (messages: unknown[]) => ({
        successCount: messages.length, failureCount: 0, responses: messages.map(() => ({ success: true })),
      }));

    const result = await pushToPersons(['p'], { type: 'calevent', tenantId: 'scs', title: 'T', body: 'B', url: '/x' }, 'test');

    expect(fx.sendEach).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ recipients: TOKENS, sent: 1, failed: 500 });
    expect(fx.deleted).toEqual([]);
  });
});

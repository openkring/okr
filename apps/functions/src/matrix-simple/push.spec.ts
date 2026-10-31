import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Final review of 1.127 phase 2: I2 (the chat deep link needs the CMS page) and M1 (the pusher
// carries the registering app's tenant).

const pages = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(),
  reads: [] as string[],
  fail: false,
}));

vi.mock('firebase-admin/firestore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase-admin/firestore')>()),
  getFirestore: () => ({
    collection: (name: string) => ({
      doc: (id: string) => ({
        get: async () => {
          pages.reads.push(`${name}/${id}`);
          if (pages.fail) throw new Error('unavailable');
          const data = name === 'pages' ? pages.docs.get(id) : undefined;
          return { exists: data !== undefined, data: () => data };
        },
      }),
    }),
  }),
}));

import { chatBadgeWithin, chatLedgerPlan, hasGroupChatPage, ledgerTargetOf, pusherTenantFor, stalePushersToPrune, type ListedPusher } from './push';

describe('hasGroupChatPage', () => {
  beforeEach(() => {
    pages.docs.clear();
    pages.reads = [];
    pages.fail = false;
  });

  it('is true only when pages/<okey>_chat exists', async () => {
    pages.docs.set('withPage_chat', { type: 'chat' });
    expect(await hasGroupChatPage('withPage')).toBe(true);
    // A group with a room but no CMS chat page (memory: group chat segment 404).
    expect(await hasGroupChatPage('roomOnly')).toBe(false);
    expect(pages.reads).toEqual(['pages/withPage_chat', 'pages/roomOnly_chat']);
  });

  it('is false for an archived page', async () => {
    pages.docs.set('archived_chat', { isArchived: true });
    expect(await hasGroupChatPage('archived')).toBe(false);
  });

  it('caches the answer per group key', async () => {
    pages.docs.set('cached_chat', {});
    expect(await hasGroupChatPage('cached')).toBe(true);
    expect(await hasGroupChatPage('cached')).toBe(true);
    expect(pages.reads).toEqual(['pages/cached_chat']);
  });

  it('answers false when the read fails', async () => {
    pages.fail = true;
    expect(await hasGroupChatPage('failing')).toBe(false);
  });
});

describe('pusherTenantFor', () => {
  it("takes the app's tenant when it is one of the account's", () => {
    expect(pusherTenantFor('kring', ['scs', 'kring'], 'u1')).toBe('kring');
  });

  it("falls back to the account's first tenant for an older client", () => {
    expect(pusherTenantFor(undefined, ['scs', 'kring'], 'u1')).toBe('scs');
    expect(pusherTenantFor('', ['scs'], 'u1')).toBe('scs');
  });

  it("never stores a tenant the account does not belong to", () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(pusherTenantFor('other', ['scs'], 'u1')).toBe('scs');
    expect(pusherTenantFor(42, ['scs'], 'u1')).toBe('scs');
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it("is empty for an account without tenants", () => {
    expect(pusherTenantFor('scs', [], 'u1')).toBe('');
  });
});

describe('stalePushersToPrune', () => {
  const me = { appId: 'app', deviceName: 'UA', pushkey: 'new', tenantId: 'scs' };
  const listed = (over: Partial<ListedPusher> = {}): ListedPusher => ({
    app_id: 'app', pushkey: 'old', device_display_name: 'UA', data: { tenantId: 'scs' }, ...over,
  });

  it('prunes same app, device and tenant with another pushkey', () => {
    const p = listed();
    expect(stalePushersToPrune([p], me, ['scs', 'bkg'])).toEqual([p]);
  });

  it("keeps the other tenant's pusher", () => {
    expect(stalePushersToPrune([listed({ data: { tenantId: 'bkg' } })], me, ['scs', 'bkg'])).toEqual([]);
  });

  it('keeps its own pushkey', () => {
    expect(stalePushersToPrune([listed({ pushkey: 'new' })], me, ['scs', 'bkg'])).toEqual([]);
  });

  it('prunes a tenant-less legacy pusher only for a single-tenant account', () => {
    const p = listed({ data: {} });
    expect(stalePushersToPrune([p], me, ['scs'])).toEqual([p]);
    expect(stalePushersToPrune([p], me, ['scs', 'bkg'])).toEqual([]);
  });

  it('keeps another device or app_id', () => {
    expect(stalePushersToPrune([listed({ device_display_name: 'Other' }), listed({ app_id: 'x' })], me, ['scs'])).toEqual([]);
  });
});

describe('ledgerTargetOf (1.127 B1, Review Focus 2)', () => {
  it("uses the pusher's uid, not the Matrix account", () => {
    // Two tenant apps of one person on one phone: one Matrix account, two pushers, two accounts.
    const d1 = { app_id: 'a', pushkey: 'k1', data: { matrixUserId: '@p:hs', uid: 'u1', tenantId: 'scs' } };
    const d2 = { app_id: 'a', pushkey: 'k2', data: { matrixUserId: '@p:hs', uid: 'u2', tenantId: 'kring' } };
    expect(ledgerTargetOf(d1)).toBe('u1');
    expect(ledgerTargetOf(d2)).toBe('u2');
  });

  it('is undefined for an older pusher without uid', () => {
    expect(ledgerTargetOf({ app_id: 'a', pushkey: 'k', data: { matrixUserId: '@p:hs' } })).toBeUndefined();
    expect(ledgerTargetOf({ app_id: 'a', pushkey: 'k' })).toBeUndefined();
  });

  it('rejects an empty, overlong or non-string uid', () => {
    expect(ledgerTargetOf({ app_id: 'a', pushkey: 'k', data: { uid: '' } })).toBeUndefined();
    expect(ledgerTargetOf({ app_id: 'a', pushkey: 'k', data: { uid: 'x'.repeat(129) } })).toBeUndefined();
    expect(ledgerTargetOf({ app_id: 'a', pushkey: 'k', data: { uid: 42 as unknown as string } })).toBeUndefined();
    expect(ledgerTargetOf({ app_id: 'a', pushkey: 'k', data: { uid: 'x'.repeat(128) } })).toBe('x'.repeat(128));
  });
});

describe('ledgerTargetOf uid alphabet (1.127 security)', () => {
  it('rejects a uid with a slash', () => {
    expect(ledgerTargetOf({ data: { uid: 'a/b' } })).toBeUndefined();
    expect(ledgerTargetOf({ data: { uid: '../x' } })).toBeUndefined();
  });

  it('rejects an empty or too long uid', () => {
    expect(ledgerTargetOf({ data: { uid: '' } })).toBeUndefined();
    expect(ledgerTargetOf({ data: { uid: 'x'.repeat(129) } })).toBeUndefined();
  });
});

describe('chatLedgerPlan (1.127 security)', () => {
  it('forged uid without that token doc does not count', () => {
    expect(chatLedgerPlan('victim', { exists: false })).toEqual({ countBadge: false });
    expect(chatLedgerPlan(undefined, { exists: true, platform: 'ios' })).toEqual({ countBadge: false });
  });

  it('own token doc counts and gives its platform', () => {
    expect(chatLedgerPlan('u1', { exists: true, platform: 'ios' })).toEqual({ countBadge: true, platform: 'ios' });
    expect(chatLedgerPlan('u1', { exists: true })).toEqual({ countBadge: true });
    expect(chatLedgerPlan('u1', { exists: true, platform: 'bogus' })).toEqual({ countBadge: true });
  });
});

describe('chatBadgeWithin (1.127 T2)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('gives up after 2 s and answers undefined, so the push goes out without a badge', async () => {
    const never = vi.fn(() => new Promise<number>(() => undefined));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const result = chatBadgeWithin('u1', 'e1', never);
    await vi.advanceTimersByTimeAsync(1_999);
    let settled = false;
    void result.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    expect(await result).toBeUndefined();
    warn.mockRestore();
  });

  it('answers the badge when the ledger is quick, undefined when it throws', async () => {
    expect(await chatBadgeWithin('u1', 'e1', async () => 7)).toBe(7);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(await chatBadgeWithin('u1', 'e1', async () => { throw new Error('x'); })).toBeUndefined();
    warn.mockRestore();
  });
});

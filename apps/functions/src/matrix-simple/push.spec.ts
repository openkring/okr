import { beforeEach, describe, expect, it, vi } from 'vitest';

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

import { hasGroupChatPage, pusherTenantFor } from './push';

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

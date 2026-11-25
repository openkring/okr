import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('firebase-functions/v2', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));

import { fakeDb, type Store } from '../credit/testing/credit-fake-db';
import { assertVersandSender } from './versand-sender';

const T = 'scs';
let store: Store;
const check = (uid: string, over: Partial<Parameters<typeof assertVersandSender>[1]> = {}) => assertVersandSender(fakeDb(store), { uid, tenantId: T, ...over });
const denied = (message: string) => ({ code: 'permission-denied', message });
const NO_ROLE = denied('This operation requires the memberAdmin or privileged role.');

beforeEach(() => {
  store = {
    'users/boss': { roles: { privileged: true }, tenants: [T], personKey: 'pb' },
    'users/ga': { roles: { registered: true }, tenants: [T], personKey: 'pa' },
    'users/any': { roles: { registered: true }, tenants: [T], personKey: 'px' },
    'groups/g1': { kind: 'group', tenants: [T], admins: [{ key: 'pa' }] },
    'groups/nl': { kind: 'newsletter', tenants: [T], admins: [{ key: 'pa' }] },
  };
});

describe('assertVersandSender', () => {
  it('lets memberAdmin, privileged and admin of the tenant send, with their user doc', async () => {
    for (const role of ['memberAdmin', 'privileged', 'admin']) {
      store['users/boss'] = { ...store['users/boss'], roles: { [role]: true } };
      expect(await check('boss', { hasStoragePath: true, hasEvents: true })).toEqual({ elevated: true, caller: store['users/boss'] });
    }
  });

  it('refuses everybody else without a group: no role, a lost role, another tenant, no user doc', async () => {
    await expect(check('any')).rejects.toMatchObject(NO_ROLE);
    await expect(check('nobody')).rejects.toMatchObject(NO_ROLE);
    await expect(check('ga')).rejects.toMatchObject(NO_ROLE);
    store['users/boss'] = { ...store['users/boss'], roles: {} };
    await expect(check('boss')).rejects.toMatchObject(NO_ROLE);
    store['users/boss'] = { ...store['users/boss'], roles: { admin: true }, tenants: ['other'] };
    await expect(check('boss')).rejects.toMatchObject(NO_ROLE);
  });

  it('lets an admin of the group, without tenant documents and answer links', async () => {
    expect(await check('ga', { groupKey: 'g1' })).toMatchObject({ elevated: false });
    await expect(check('any', { groupKey: 'g1' })).rejects.toMatchObject(denied('Only an admin of the group may send to its members.'));
    await expect(check('ga', { groupKey: 'g1', hasStoragePath: true })).rejects.toMatchObject(denied('A group admin may only attach files from the device.'));
    await expect(check('ga', { groupKey: 'g1', hasEvents: true })).rejects.toMatchObject(denied('A group admin cannot send answer links.'));
    await expect(check('boss', { groupKey: 'g1', hasEvents: true })).rejects.toMatchObject(denied('A group admin cannot send answer links.'));
    store['groups/g1'] = { ...store['groups/g1'], tenants: ['other'] };
    await expect(check('ga', { groupKey: 'g1' })).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('names the newsletter group, for its admin and for an elevated caller', async () => {
    expect(await check('boss', { groupKey: 'nl', hasEvents: true, hasStoragePath: true })).toMatchObject({ elevated: true, newsletterGroupKey: 'nl' });
    expect(await check('ga', { groupKey: 'nl' })).toMatchObject({ elevated: false, newsletterGroupKey: 'nl' });
    await expect(check('any', { groupKey: 'nl' })).rejects.toMatchObject(denied('Only an admin of the newsletter may send to its subscribers.'));
    await expect(check('ga', { groupKey: 'nl', hasStoragePath: true })).rejects.toMatchObject(denied('A group admin may only attach files from the device.'));
    await expect(check('ga', { groupKey: 'nl', hasEvents: true })).rejects.toMatchObject(denied('A group admin cannot send answer links.'));
    expect(await check('boss', { groupKey: 'g1' })).not.toHaveProperty('newsletterGroupKey');
  });

  it('refuses an archived newsletter and another tenant\'s', async () => {
    const refusal = { code: 'failed-precondition', message: 'This newsletter is archived or belongs to another tenant.' };
    store['groups/nl'] = { ...store['groups/nl'], isArchived: true };
    await expect(check('boss', { groupKey: 'nl' })).rejects.toMatchObject(refusal);
    store['groups/nl'] = { kind: 'newsletter', tenants: ['other'], admins: [{ key: 'pa' }] };
    await expect(check('ga', { groupKey: 'nl' })).rejects.toMatchObject(refusal);
  });

  it('tells a caller of another tenant nothing about a group: the same refusal for every key', async () => {
    store['users/out'] = { roles: { admin: true }, tenants: ['other'], personKey: 'po' };
    store['groups/old'] = { kind: 'newsletter', tenants: [T], isArchived: true, admins: [{ key: 'po' }] };
    store['groups/theirs'] = { kind: 'newsletter', tenants: ['other'], admins: [{ key: 'po' }] };
    for (const uid of ['out', 'nobody']) {
      for (const flags of [{}, { hasEvents: true }, { hasStoragePath: true }]) {
        const refusals = await Promise.all(['old', 'theirs', 'nl', 'g1', 'none'].map((groupKey) => check(uid, { groupKey, ...flags }).catch((e: { code: string; message: string }) => `${e.code} ${e.message}`)));
        expect(new Set(refusals).size, refusals.join(' | ')).toBe(1);
        expect(refusals[0]).toMatch(/^permission-denied /);
      }
    }
  });

  it('refuses a groupKey that is no document id', async () => {
    for (const uid of ['boss', 'ga']) await expect(check(uid, { groupKey: 'a/b' })).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});

import { describe, expect, it, vi } from 'vitest';
import type { HouseholdModel } from '@okr/shared-models';

import {
  addressParentKeyOf, answerKeyOf, contactKeysFor, householdFieldsOf, householdIdOf, dropHouseholdKeys, type HouseholdRecipient, loadHouseholdRecipients, postKeysFor, resolveHouseholdRecipient,
} from './household-recipient.logic';

const household = (over: Partial<HouseholdModel> = {}): HouseholdModel => ({
  okey: 'h1', tenants: ['scs'], isArchived: false, index: '', tags: '', notes: '',
  name: 'Familie Muster', type: '', memberKeys: ['p1', 'p2'], payerKey: 'p1', contactKey: 'p1',
  bundle: { post: true, email: false, inApp: false }, ...over,
} as HouseholdModel);

describe('resolveHouseholdRecipient', () => {
  it('resolves a valid household to its contact and name', () => {
    expect(resolveHouseholdRecipient(household(), 'scs')).toEqual({ contactKey: 'p1', name: 'Familie Muster' });
  });

  it('is undefined for a missing doc', () => {
    expect(resolveHouseholdRecipient(undefined, 'scs')).toBeUndefined();
  });

  it('is undefined for a foreign tenant or a shared doc', () => {
    expect(resolveHouseholdRecipient(household({ tenants: ['other'] }), 'scs')).toBeUndefined();
    expect(resolveHouseholdRecipient(household({ tenants: ['scs', 'other'] }), 'scs')).toBeUndefined();
    expect(resolveHouseholdRecipient(household({ tenants: undefined as never }), 'scs')).toBeUndefined();
  });

  it('is undefined for an archived household', () => {
    expect(resolveHouseholdRecipient(household({ isArchived: true }), 'scs')).toBeUndefined();
  });

  it('is undefined when the contact is not a member (or empty)', () => {
    expect(resolveHouseholdRecipient(household({ contactKey: 'p9' }), 'scs')).toBeUndefined();
    expect(resolveHouseholdRecipient(household({ contactKey: '' }), 'scs')).toBeUndefined();
    expect(resolveHouseholdRecipient(household({ memberKeys: undefined as never }), 'scs')).toBeUndefined();
  });

  it('is undefined for a household without a name (saveHousehold refuses one)', () => {
    expect(resolveHouseholdRecipient(household({ name: '  ' }), 'scs')).toBeUndefined();
  });
});

const H = new Map<string, HouseholdRecipient>([['household.h1', { contactKey: 'p1', name: 'Familie Muster' }]]);
const D = [
  { personKey: 'household.h1', channels: ['email', 'chat', 'post'] },
  { personKey: 'p1', channels: ['email', 'post'] },
  { personKey: 'p3', channels: ['email', 'chat'] },
  { personKey: 'org.o1', channels: ['email', 'post'] },
  { personKey: 'household.gone', channels: ['email', 'chat', 'post'] },
];

describe('contactKeysFor (E-Mail, In-App)', () => {
  it('replaces a household by its contact, drops an unresolved one and keeps each person once', () => {
    expect(contactKeysFor(D, 'email', H)).toEqual(['p1', 'p3', 'org.o1']);
    expect(contactKeysFor(D, 'chat', H)).toEqual(['p1', 'p3']);
  });

  it('leaves person and org keys alone without households', () => {
    expect(contactKeysFor(D.slice(1, 4), 'email', new Map())).toEqual(['p1', 'p3', 'org.o1']);
  });
});

describe('postKeysFor', () => {
  it('keeps a resolved household key, drops the unresolved one and the contact ticked on its own', () => {
    expect(postKeysFor(D, H)).toEqual(['household.h1', 'org.o1']);
  });

  it('keeps the contact when the household is not on Post', () => {
    const d = [{ personKey: 'household.h1', channels: ['email'] }, { personKey: 'p1', channels: ['post'] }];
    expect(postKeysFor(d, H)).toEqual(['p1']);
  });
});

describe('answerKeyOf', () => {
  it('is the contact for a household key and the key itself otherwise', () => {
    expect(answerKeyOf('household.h1', H)).toBe('p1');
    expect(answerKeyOf('p3', H)).toBe('p3');
    expect(answerKeyOf('household.gone', H)).toBeUndefined();
  });
});

describe('addressParentKeyOf', () => {
  it('reads a household at its contact, a person and an org at their own key', () => {
    expect(addressParentKeyOf('household.h1', H)).toBe('person.p1');
    expect(addressParentKeyOf('household.gone', H)).toBeUndefined();
    expect(addressParentKeyOf('p3', H)).toBe('person.p3');
    expect(addressParentKeyOf('org.o1', H)).toBe('org.o1');
  });
});

describe('dropHouseholdKeys', () => {
  it('removes every household key and names the dropped ones', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(dropHouseholdKeys(D, 'm1').map((d) => d.personKey)).toEqual(['p1', 'p3', 'org.o1']);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('m1'), expect.objectContaining({ householdKey: 'household.h1' }));
    warn.mockRestore();
  });
});

describe('loadHouseholdRecipients', () => {
  const db = (docs: Record<string, Partial<HouseholdModel> | undefined>) => ({
    collection: (name: string) => ({ doc: (id: string) => ({ name, id }) }),
    getAll: async (...refs: { name: string; id: string }[]) => refs.map((r) => ({ data: () => (r.name === 'households' ? docs[r.id] : undefined) })),
  });

  it('reads only household keys, resolves them and logs the dropped ones without names', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const got = await loadHouseholdRecipients(db({ h1: household(), h2: household({ tenants: ['other'] }) }) as never, 'scs',
      ['p1', 'household.h1', 'household.h2', 'household.h3', 'household.h1'], 'm1');
    expect([...got]).toEqual([['household.h1', { contactKey: 'p1', name: 'Familie Muster' }]]);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(warn.mock.calls)).not.toContain('Familie');
    warn.mockRestore();
  });

  it('drops an empty id or one with a slash without calling doc(), and warns with the key only', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const doc = vi.fn(() => { throw new Error('doc() must not be called'); });
    const getAll = vi.fn();
    const got = await loadHouseholdRecipients({ collection: () => ({ doc }), getAll } as never, 'scs', ['household.', 'household.a/b'], 'm1');
    expect(got.size).toBe(0);
    expect(doc).not.toHaveBeenCalled();
    expect(getAll).not.toHaveBeenCalled();
    expect(warn.mock.calls.map((c) => (c[1] as { householdKey: string }).householdKey)).toEqual(['household.', 'household.a/b']);
    warn.mockRestore();
  });

  it('reads nothing without a household key', async () => {
    const getAll = vi.fn();
    const got = await loadHouseholdRecipients({ collection: () => ({ doc: () => ({}) }), getAll } as never, 'scs', ['p1', 'org.o1'], 'm1');
    expect(got.size).toBe(0);
    expect(getAll).not.toHaveBeenCalled();
  });
});

describe('householdIdOf', () => {
  it('is the okey of a valid key, undefined for an empty id, a slash or another key', () => {
    expect(householdIdOf('household.h1')).toBe('h1');
    expect(householdIdOf('household.')).toBeUndefined();
    expect(householdIdOf('household.a/b')).toBeUndefined();
    expect(householdIdOf('p1')).toBeUndefined();
  });
});

describe('householdFieldsOf (written by onMailing before anything is sent)', () => {
  it('names the contact and the household per key, and nothing without households', () => {
    expect(householdFieldsOf(H)).toEqual({ householdContacts: { 'household.h1': 'p1' }, householdNames: { 'household.h1': 'Familie Muster' } });
    expect(householdFieldsOf(new Map())).toEqual({});
  });
});

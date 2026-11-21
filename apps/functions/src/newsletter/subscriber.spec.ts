import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('firebase-functions/v2', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { fakeDb, Store } from '../credit/testing/credit-fake-db';
import { SubscribeInput, subscribePerson } from './subscriber';
import { AMBIGUOUS_TASK_NAME, NAME_DIFFERS_TASK_NAME } from './subscriber.logic';

const T = 'la21';
const input: SubscribeInput = {
  tenantId: T, groupKey: 'nl1', groupName: 'Dorfnews', firstName: 'Anna', lastName: 'Muster',
  email: ' Anna@Example.CH ', city: 'Stäfa', source: 'form', formKey: 'f1', confirmedAt: '20261121120000',
  dateOfEntry: '20261121',
};

const docsIn = (store: Store, col: string) => Object.entries(store)
  .filter(([p]) => p.startsWith(`${col}/`) && !p.slice(col.length + 1).includes('/'))
  .map(([p, d]) => ({ id: p.split('/').pop() as string, ...d }));

function email(parent: string, value: string, extra: Record<string, unknown> = {}) {
  return { addressChannel: 'email', email: value, parentKey: `person.${parent}`, tenants: [T], isFavorite: false, isArchived: false, ...extra };
}

let store: Store;
beforeEach(() => {
  store = {
    'users/u1': { tenants: [T], roles: { memberAdmin: true }, personKey: 'adm' },
    'persons/adm': { firstName: 'Mia', lastName: 'Admin', tenants: [T] },
  };
});

describe('subscribePerson', () => {
  it('no match: creates person, favourite email, city-only postal address and the subscription', async () => {
    expect(await subscribePerson(fakeDb(store), input)).toBe('subscribed');

    const persons = docsIn(store, 'persons').filter((p) => p.id !== 'adm');
    expect(persons).toHaveLength(1);
    const person = persons[0];
    expect(person).toMatchObject({ firstName: 'Anna', lastName: 'Muster', tenants: [T], index: 'n:Muster fn:Anna' });
    expect(person).not.toHaveProperty('okey');

    const addresses = docsIn(store, 'addresses');
    expect(addresses).toHaveLength(2);
    expect(addresses.find((a) => a['addressChannel'] === 'email')).toMatchObject({
      email: 'anna@example.ch', parentKey: `person.${person.id}`, tenants: [T], isFavorite: true, isArchived: false,
      index: `n:anna@example.ch p:person.${person.id} o:Anna Muster`,
    });
    expect(addresses.find((a) => a['addressChannel'] === 'postal')).toMatchObject({
      city: 'Stäfa', streetName: '', zipCode: '', parentKey: `person.${person.id}`, tenants: [T], isFavorite: true,
    });

    const subs = docsIn(store, 'newsletterSubscriptions');
    expect(subs).toHaveLength(1);
    expect(subs[0]).toMatchObject({
      personKey: person.id, personName: 'Anna Muster', groupKey: 'nl1', groupName: 'Dorfnews', tenants: [T],
      dateOfEntry: '20261121', dateOfExit: '', source: 'form', formKey: 'f1', confirmedAt: '20261121120000',
      importOptinAt: '', importConfirmAt: '',
    });
    // the email lives only in the address vault
    expect(JSON.stringify(subs[0])).not.toContain('example.ch');
    expect(docsIn(store, 'tasks')).toHaveLength(0);
  });

  it('no city: no postal address', async () => {
    await subscribePerson(fakeDb(store), { ...input, city: ' ' });
    expect(docsIn(store, 'addresses').map((a) => a['addressChannel'])).toEqual(['email']);
  });

  it('existing person with the same name: subscribes it, changes neither person nor addresses, no task', async () => {
    store['persons/p1'] = { firstName: 'Anna', lastName: 'Muster', tenants: [T] };
    store['addresses/a1'] = email('p1', 'anna@example.ch', { isFavorite: true });
    const before = JSON.stringify([store['persons/p1'], store['addresses/a1']]);

    expect(await subscribePerson(fakeDb(store), input)).toBe('subscribed');
    expect(JSON.stringify([store['persons/p1'], store['addresses/a1']])).toBe(before);
    expect(docsIn(store, 'persons')).toHaveLength(2);
    expect(docsIn(store, 'addresses')).toHaveLength(1);
    expect(docsIn(store, 'newsletterSubscriptions')[0]).toMatchObject({ personKey: 'p1' });
    expect(docsIn(store, 'tasks')).toHaveLength(0);
  });

  it('existing person with another name: subscribes it and gives each memberAdmin one task (names, no email)', async () => {
    store['persons/p1'] = { firstName: 'Anne', lastName: 'Muster-Meier', tenants: [T] };
    store['addresses/a1'] = email('p1', 'anna@example.ch');

    expect(await subscribePerson(fakeDb(store), input)).toBe('subscribed');
    expect(store['persons/p1']).toEqual({ firstName: 'Anne', lastName: 'Muster-Meier', tenants: [T] });
    const tasks = docsIn(store, 'tasks');
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      name: NAME_DIFFERS_TASK_NAME, tenants: [T], relatedModelType: 'person', relatedKey: 'person.p1',
      assignee: expect.objectContaining({ key: 'adm' }), author: expect.objectContaining({ name1: 'System' }),
    });
    expect(tasks[0]['notes']).toContain('«Anna Muster»');
    expect(tasks[0]['notes']).toContain('«Anne Muster-Meier»');
    expect(JSON.stringify(tasks[0])).not.toContain('example.ch');

    // the same sign-up again: already subscribed, still one task (deterministic id)
    expect(await subscribePerson(fakeDb(store), input)).toBe('alreadySubscribed');
    expect(docsIn(store, 'tasks')).toHaveLength(1);
    expect(docsIn(store, 'newsletterSubscriptions')).toHaveLength(1);
  });

  it('active subscription exists: nothing is written', async () => {
    store['persons/p1'] = { firstName: 'Anna', lastName: 'Muster', tenants: [T] };
    store['addresses/a1'] = email('p1', 'anna@example.ch');
    store['newsletterSubscriptions/s1'] = { tenants: [T], personKey: 'p1', groupKey: 'nl1', dateOfExit: '', isArchived: false };
    expect(await subscribePerson(fakeDb(store), input)).toBe('alreadySubscribed');
    expect(docsIn(store, 'newsletterSubscriptions')).toHaveLength(1);
  });

  it('only an ended subscription exists: subscribes again', async () => {
    store['persons/p1'] = { firstName: 'Anna', lastName: 'Muster', tenants: [T] };
    store['addresses/a1'] = email('p1', 'anna@example.ch');
    store['newsletterSubscriptions/s1'] = { tenants: [T], personKey: 'p1', groupKey: 'nl1', dateOfExit: '20260101', isArchived: false };
    expect(await subscribePerson(fakeDb(store), input)).toBe('subscribed');
    expect(docsIn(store, 'newsletterSubscriptions')).toHaveLength(2);
  });

  it('never matches across tenants (D-L1): an address of another tenant is ignored, a new person is created', async () => {
    store['persons/p1'] = { firstName: 'Anna', lastName: 'Muster', tenants: [T, 'scs'] };
    store['addresses/a1'] = email('p1', 'anna@example.ch', { tenants: ['scs'], isFavorite: true });
    store['persons/p2'] = { firstName: 'Anna', lastName: 'Muster', tenants: [T] };
    store['addresses/a2'] = email('p2', 'anna@example.ch', { isArchived: true });

    expect(await subscribePerson(fakeDb(store), input)).toBe('subscribed');
    const sub = docsIn(store, 'newsletterSubscriptions')[0];
    expect(['p1', 'p2']).not.toContain(sub['personKey']);
    expect(store['addresses/a1']).toMatchObject({ tenants: ['scs'] });
  });

  it('several persons, one favourite: that one', async () => {
    store['persons/p1'] = { firstName: 'Anna', lastName: 'Muster', tenants: [T] };
    store['persons/p2'] = { firstName: 'Bea', lastName: 'Muster', tenants: [T] };
    store['addresses/a1'] = email('p1', 'anna@example.ch', { isFavorite: true });
    store['addresses/a2'] = email('p2', 'anna@example.ch');
    expect(await subscribePerson(fakeDb(store), input)).toBe('subscribed');
    expect(docsIn(store, 'newsletterSubscriptions')[0]).toMatchObject({ personKey: 'p1' });
  });

  it('ambiguous: writes no person, address or subscription and gives the memberAdmins a task naming the candidates', async () => {
    store['persons/p1'] = { firstName: 'Anna', lastName: 'Muster', tenants: [T] };
    store['persons/p2'] = { firstName: 'Bea', lastName: 'Muster', tenants: [T] };
    store['addresses/a1'] = email('p1', 'anna@example.ch');
    store['addresses/a2'] = email('p2', 'anna@example.ch');

    expect(await subscribePerson(fakeDb(store), input)).toBe('ambiguous');
    expect(docsIn(store, 'persons')).toHaveLength(3);
    expect(docsIn(store, 'addresses')).toHaveLength(2);
    expect(docsIn(store, 'newsletterSubscriptions')).toHaveLength(0);
    const tasks = docsIn(store, 'tasks');
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ name: AMBIGUOUS_TASK_NAME, relatedModelType: 'group', relatedKey: 'group.nl1' });
    expect(tasks[0]['notes']).toContain('Anna Muster, Bea Muster');
    expect(JSON.stringify(tasks[0])).not.toContain('example.ch');
  });

  it('import: stores the Mailchimp timestamps and source', async () => {
    const row: SubscribeInput = {
      tenantId: T, groupKey: 'nl1', groupName: 'Dorfnews', firstName: 'Anna', lastName: 'Muster', email: 'anna@example.ch',
      city: '', source: 'import', importOptinAt: '2024-01-02 10:00:00', importConfirmAt: '2024-01-02 10:05:00', dateOfEntry: '20240102',
    };
    expect(await subscribePerson(fakeDb(store), row)).toBe('subscribed');
    expect(docsIn(store, 'newsletterSubscriptions')[0]).toMatchObject({
      source: 'import', formKey: '', confirmedAt: '', importOptinAt: '2024-01-02 10:00:00', importConfirmAt: '2024-01-02 10:05:00',
    });
  });

  it('rejects an empty email', async () => {
    await expect(subscribePerson(fakeDb(store), { ...input, email: '  ' })).rejects.toThrow();
  });
});

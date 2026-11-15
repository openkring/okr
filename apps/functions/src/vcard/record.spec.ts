import { describe, expect, it } from 'vitest';
import type { ExportScope } from '@okr/vcard-util';

import { avatarDocIds, toVcardRecord } from './record';

const SCOPE: ExportScope = { identity: true, addresses: ['phone', 'email'], birthday: false, photo: false, workRels: true, personalRels: false, orgLinks: false };

describe('toVcardRecord', () => {
  it('sets uid person-<okey> and the nickname', () => {
    const r = toVcardRecord({ kind: 'person', key: 'abc', data: { firstName: 'Anna', lastName: 'Muster', nickname: 'Anni' }, addresses: [], workrels: [], scope: SCOPE, favoritesOnly: false });
    expect(r.uid).toBe('person-abc');
    expect(r.nickname).toBe('Anni');
    expect(r.displayName).toBe('Anna Muster');
  });

  it('sorts workrels newest first and keeps the first as employment', () => {
    const r = toVcardRecord({
      kind: 'person', key: 'abc', data: { firstName: 'A', lastName: 'B' }, addresses: [],
      workrels: [
        { objectName: 'Old AG', validFrom: '20100101' },
        { objectName: 'New AG', validFrom: '20200101', label: 'CTO' },
      ],
      scope: SCOPE, favoritesOnly: false,
    });
    expect(r.employment?.org).toBe('New AG');
    expect(r.relatedNames.map((n) => n.name)).toEqual(['Old AG']);
  });

  it('maps phone and email channels and drops others outside the scope', () => {
    const r = toVcardRecord({
      kind: 'person', key: 'abc', data: { firstName: 'A', lastName: 'B' },
      addresses: [
        { addressChannel: 'phone', phone: '+41791234567', addressUsage: 'mobile', isFavorite: true },
        { addressChannel: 'email', email: 'a@b.ch' },
        { addressChannel: 'postal', streetName: 'X', city: 'Y' },
      ],
      workrels: [], scope: SCOPE, favoritesOnly: false,
    });
    expect(r.channels.map((c) => c.channel)).toEqual(['phone', 'email']);
    expect(r.channels[0]).toMatchObject({ type: 'CELL', pref: true });
  });

  it('builds an org card with uid org-<okey>', () => {
    const r = toVcardRecord({ kind: 'org', key: 'o1', data: { name: 'Acme AG' }, addresses: [], workrels: [], scope: SCOPE, favoritesOnly: false });
    expect(r).toMatchObject({ kind: 'org', uid: 'org-o1', displayName: 'Acme AG', orgName: 'Acme AG' });
  });
});

describe('avatarDocIds', () => {
  it('lists the tenant\'s own picture first, then the shared one', () => {
    expect(avatarDocIds('bka', 'person', 'abc')).toEqual(['bka.person.abc', 'person.abc']);
  });
});

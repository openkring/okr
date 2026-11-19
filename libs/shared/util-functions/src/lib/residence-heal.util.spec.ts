import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DocumentReference, Firestore } from 'firebase-admin/firestore';

import { AddressModel } from '@okr/shared-models';

import { healDecision, healResidence, residenceTenants, syncResidenceTenants } from './residence-heal.util';
import { resetSwisstopoState } from './swisstopo.util';

vi.mock('firebase-functions/logger', () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }));

function postal(overrides: Partial<AddressModel> = {}): AddressModel {
  return Object.assign(new AddressModel('scs'), {
    okey: 'a1',
    parentKey: 'person.p1',
    addressChannel: 'postal',
    streetName: 'Seestrasse',
    streetNumber: '12',
    zipCode: '8712',
    city: 'Stäfa',
    countryCode: 'CH',
    tenants: ['scs'],
    ...overrides,
  });
}

const LINKED = postal({ locationKey: 'loc1' });

/** One exact swisstopo hit for Seestrasse 12, 8712 Stäfa. */
const SWISSTOPO_HIT = {
  results: [
    {
      attrs: {
        origin: 'address',
        featureId: '101880576_0',
        label: 'Seestrasse 12 <b>8712 Stäfa</b>',
        lat: 47.239643,
        lon: 8.715611,
        links: [{ href: '/rest/services/ech/MapServer/ch.swisstopo.amtliches-gebaeudeadressverzeichnis/101880576', rel: 'related' }],
      },
    },
  ],
};

function fetchReturning(status: number, body: unknown = {}): typeof fetch {
  return vi.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response) as unknown as typeof fetch;
}

function fakeRef(): DocumentReference & { update: ReturnType<typeof vi.fn> } {
  return { id: 'a1', update: vi.fn().mockResolvedValue(undefined) } as unknown as DocumentReference & { update: ReturnType<typeof vi.fn> };
}

/** A db whose register has no location yet: every find-or-create creates 'new-loc'. */
function fakeDb() {
  const newRef = { id: 'new-loc', set: vi.fn().mockResolvedValue(undefined) };
  const query = { where: vi.fn() };
  query.where.mockReturnValue(query);
  const collection = vi.fn(() => ({ where: query.where, doc: () => newRef }));
  const runTransaction = vi.fn(async (fn: (tx: unknown) => Promise<string>) => fn({ get: vi.fn().mockResolvedValue({ docs: [] }), set: vi.fn() }));
  return { db: { collection, runTransaction } as unknown as Firestore, runTransaction, newRef };
}

describe('healDecision', () => {
  it('links an active postal row without locationKey', () => {
    expect(healDecision(undefined, postal(), ['scs'])).toBe('link');
    expect(healDecision(postal(), postal({ city: 'Staefa' }), ['scs'])).toBe('link');
  });

  it('relinks a linked row whose street changed', () => {
    expect(healDecision(LINKED, postal({ locationKey: 'loc1', streetName: 'Bahnhofstrasse' }), ['scs'])).toBe('relink');
  });

  it('relinks on a change of number, zip, city or country code', () => {
    for (const change of [{ streetNumber: '14' }, { zipCode: '8713' }, { city: 'Uerikon' }, { countryCode: 'DE' }]) {
      expect(healDecision(LINKED, postal({ locationKey: 'loc1', ...change }), ['scs'])).toBe('relink');
    }
  });

  it('is none when only addressValue2 changed on a linked row', () => {
    expect(healDecision(LINKED, postal({ locationKey: 'loc1', addressValue2: 'c/o Muster' }), ['scs'])).toBe('none');
  });

  it('is not a relink when the same write also changed locationKey (the writer linked it)', () => {
    expect(healDecision(LINKED, postal({ locationKey: 'loc2', streetName: 'Bahnhofstrasse' }), ['scs'])).toBe('none');
    expect(healDecision(LINKED, postal({ locationKey: 'loc2', streetName: 'Bahnhofstrasse' }), ['scs', 'kring'])).toBe('tenants-only');
  });

  it('is not a relink on create of a linked row', () => {
    expect(healDecision(undefined, LINKED, ['scs'])).toBe('none');
  });

  it('is tenants-only when a linked unchanged row lacks one of the parent tenants', () => {
    expect(healDecision(LINKED, LINKED, ['scs', 'kring'])).toBe('tenants-only');
  });

  it('compares tenants regardless of order', () => {
    expect(healDecision(undefined, postal({ locationKey: 'loc1', tenants: ['kring', 'scs'] }), ['scs', 'kring'])).toBe('none');
  });

  it('is none for an email row', () => {
    const email = Object.assign(new AddressModel('scs'), { addressChannel: 'email', email: 'a@b.ch' });
    expect(healDecision(undefined, email, ['scs', 'kring'])).toBe('none');
  });

  it('is none for an archived postal row', () => {
    expect(healDecision(undefined, postal({ isArchived: true }), ['scs', 'kring'])).toBe('none');
  });

  it('does not re-attempt a link when only tenants changed on an unlinked row', () => {
    expect(healDecision(postal({ tenants: ['scs'] }), postal({ tenants: ['scs', 'kring'] }), ['scs', 'kring'])).toBe('none');
    expect(healDecision(postal({ tenants: ['scs'] }), postal({ tenants: ['scs', 'kring'] }), ['scs'])).toBe('tenants-only');
  });

  it('ignores an okey present on only one side (the trigger attaches it to after)', () => {
    const withoutOkey: Partial<AddressModel> = { ...postal({ tenants: ['scs'] }) };
    delete withoutOkey.okey;
    expect(healDecision(withoutOkey as AddressModel, postal({ tenants: ['scs', 'kring'] }), ['scs', 'kring'])).toBe('none');
  });

  it('is none when an old client only changed case, diacritics or spacing of a linked row', () => {
    expect(healDecision(LINKED, postal({ locationKey: 'loc1', streetName: 'seestrasse', city: 'Stafa', countryCode: 'ch' }), ['scs'])).toBe('none');
    expect(healDecision(LINKED, postal({ locationKey: 'loc1', streetName: ' Seestrasse ' }), ['scs'])).toBe('none');
  });

  it('yields none when the healed row is fed back (no trigger loop)', () => {
    const before = postal({ streetName: 'seestrasse', tenants: ['scs'] });
    const healed = postal({ locationKey: 'new-loc', tenants: ['scs', 'kring'] });
    expect(healDecision(before, healed, ['scs', 'kring'])).toBe('none');
  });
});

describe('residenceTenants', () => {
  it('takes the parent tenants when the row shares one, else []', () => {
    expect(residenceTenants(['scs'], ['scs', 'kring'])).toEqual(['scs', 'kring']);
    expect(residenceTenants(['scs', 'kring'], ['scs'])).toEqual(['scs']);
    expect(residenceTenants(['kring'], ['scs'])).toEqual([]);
    expect(residenceTenants([], ['scs'])).toEqual([]);
    expect(residenceTenants(undefined, ['scs'])).toEqual([]);
  });
});

describe('heal feed-back (R-d)', () => {
  it('a row narrowed to [] fed back is none (fixed point, no loop)', () => {
    expect(healDecision(postal({ locationKey: 'loc1', tenants: ['kring'] }), postal({ locationKey: 'loc1', tenants: [] }), ['scs'])).toBe('none');
    expect(healDecision(postal({ tenants: ['x'] }), postal({ tenants: [] }), ['z'])).toBe('none');
    expect(healDecision(undefined, postal({ locationKey: 'loc1', tenants: [] }), ['scs'])).toBe('none');
  });


  beforeEach(() => {
    resetSwisstopoState();
  });

  /** Applies the heal's patch to the row, as the re-triggered onAddressChange would see it. */
  async function healOnce(before: AddressModel | undefined, after: AddressModel, parentTenants: string[], fetchFn: typeof fetch) {
    const { db } = fakeDb();
    const ref = fakeRef();
    await healResidence(db, ref, after, healDecision(before, after, parentTenants), parentTenants, fetchFn);
    const patch = ref.update.mock.calls[0]?.[0] ?? {};
    return { ref, healed: postal({ ...after, ...patch }) };
  }

  it('a relink to the same location that normalises the snapshot ends in none', async () => {
    // linked to new-loc; an old client rewrote the street to a different-case spelling plus a number change
    const before = postal({ locationKey: 'new-loc', streetNumber: '14' });
    const after = postal({ locationKey: 'new-loc', streetName: 'seestrasse', streetNumber: '12' });
    expect(healDecision(before, after, ['scs'])).toBe('relink');
    const { ref, healed } = await healOnce(before, after, ['scs'], fetchReturning(200, SWISSTOPO_HIT));
    expect(ref.update).toHaveBeenCalledWith({ streetName: 'Seestrasse' });
    expect(healDecision(after, healed, ['scs'])).toBe('none');
  });

  it('a relink miss clears the link; the one extra link pass writes nothing', async () => {
    const miss = fetchReturning(200, { results: [] });
    const before = postal({ locationKey: 'loc1' });
    const after = postal({ locationKey: 'loc1', streetName: 'Nirgendweg' });
    const first = await healOnce(before, after, ['scs'], miss);
    expect(first.ref.update).toHaveBeenCalledWith({ locationKey: '' });
    expect(healDecision(after, first.healed, ['scs'])).toBe('link');
    const second = await healOnce(after, first.healed, ['scs'], miss);
    expect(second.ref.update).not.toHaveBeenCalled();
  });
});

describe('healResidence', () => {
  beforeEach(() => {
    resetSwisstopoState();
  });

  it('links an exact swisstopo hit and writes locationKey, snapshot and tenants', async () => {
    const { db, runTransaction } = fakeDb();
    const ref = fakeRef();
    await healResidence(db, ref, postal({ streetName: 'seestrasse' }), 'link', ['scs', 'kring'], fetchReturning(200, SWISSTOPO_HIT));
    expect(runTransaction).toHaveBeenCalledTimes(1);
    expect(ref.update).toHaveBeenCalledWith({ locationKey: 'new-loc', streetName: 'Seestrasse', tenants: ['scs', 'kring'] });
  });

  it('leaves locationKey empty on a swisstopo 429, still writes tenants and does not throw', async () => {
    const { db, runTransaction } = fakeDb();
    const ref = fakeRef();
    await expect(healResidence(db, ref, postal(), 'link', ['scs', 'kring'], fetchReturning(429))).resolves.toBeUndefined();
    expect(runTransaction).not.toHaveBeenCalled();
    expect(ref.update).toHaveBeenCalledWith({ tenants: ['scs', 'kring'] });
  });

  it('gives a foreign row a manual location without asking swisstopo', async () => {
    const { db, newRef } = fakeDb();
    const ref = fakeRef();
    const fetchFn = fetchReturning(200, SWISSTOPO_HIT);
    const row = postal({ streetName: 'Hauptstrasse', streetNumber: '5a', zipCode: '78462', city: 'Konstanz', countryCode: 'de' });
    await healResidence(db, ref, row, 'link', ['scs'], fetchFn);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(newRef.set).toHaveBeenCalledTimes(1);
    expect(ref.update).toHaveBeenCalledWith({ locationKey: 'new-loc', countryCode: 'DE' });
  });

  it('drops a stale link when a corrected Swiss address cannot be resolved', async () => {
    const { db } = fakeDb();
    const ref = fakeRef();
    await healResidence(db, ref, postal({ locationKey: 'loc1', streetName: 'Nirgendweg' }), 'relink', ['scs'], fetchReturning(200, { results: [] }));
    expect(ref.update).toHaveBeenCalledWith({ locationKey: '' });
  });

  it('never touches validFrom / validTo', async () => {
    const { db } = fakeDb();
    const ref = fakeRef();
    await healResidence(db, ref, postal({ validFrom: '20200101', validTo: '' }), 'link', ['scs', 'kring'], fetchReturning(200, SWISSTOPO_HIT));
    const patch = ref.update.mock.calls[0][0];
    expect(patch).not.toHaveProperty('validFrom');
    expect(patch).not.toHaveProperty('validTo');
  });

  it('narrows a row planted on a foreign parent to [] without linking it (injection guard)', async () => {
    const { db, runTransaction, newRef } = fakeDb();
    const ref = fakeRef();
    const fetchFn = fetchReturning(200, SWISSTOPO_HIT);
    const foreign = postal({ tenants: ['x'] });
    await healResidence(db, ref, foreign, healDecision(undefined, foreign, ['z']), ['z'], fetchFn);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(runTransaction).not.toHaveBeenCalled();
    expect(newRef.set).not.toHaveBeenCalled();
    expect(ref.update).toHaveBeenCalledWith({ tenants: [] });
  });

  it('narrows a linked row of a club the parent left entirely to []', async () => {
    const { db } = fakeDb();
    const ref = fakeRef();
    const row = postal({ locationKey: 'loc1', tenants: ['kring'] });
    expect(healDecision(row, row, ['scs'])).toBe('tenants-only');
    await healResidence(db, ref, row, 'tenants-only', ['scs']);
    expect(ref.update).toHaveBeenCalledWith({ tenants: [] });
  });

  it('narrows [scs, kring] to [scs] and widens [scs] to [scs, kring]', async () => {
    const { db } = fakeDb();
    const narrow = fakeRef();
    await healResidence(db, narrow, postal({ locationKey: 'loc1', tenants: ['scs', 'kring'] }), 'tenants-only', ['scs']);
    expect(narrow.update).toHaveBeenCalledWith({ tenants: ['scs'] });
    const widen = fakeRef();
    await healResidence(db, widen, postal({ locationKey: 'loc1', tenants: ['scs'] }), 'tenants-only', ['scs', 'kring']);
    expect(widen.update).toHaveBeenCalledWith({ tenants: ['scs', 'kring'] });
  });

  it('writes nothing when nothing differs', async () => {
    const { db } = fakeDb();
    const ref = fakeRef();
    await healResidence(db, ref, postal({ locationKey: 'loc1' }), 'tenants-only', ['scs'], fetchReturning(200, SWISSTOPO_HIT));
    await healResidence(db, ref, postal(), 'none', ['scs', 'kring']);
    expect(ref.update).not.toHaveBeenCalled();
  });
});

describe('syncResidenceTenants', () => {
  function dbWith(rows: Partial<AddressModel>[]) {
    const docs = rows.map((r, i) => ({ id: `a${i}`, data: () => r, ref: { update: vi.fn().mockResolvedValue(undefined) } }));
    const where = vi.fn(() => ({ get: vi.fn().mockResolvedValue({ docs }) }));
    const db = { collection: vi.fn(() => ({ where })) } as unknown as Firestore;
    return { db, docs, where };
  }

  it('removes a tenant the parent lost from every residence, archived ones included', async () => {
    const { db, docs, where } = dbWith([
      { addressChannel: 'postal', tenants: ['scs', 'kring'] },
      { addressChannel: 'postal', tenants: ['scs', 'kring'], isArchived: true },
      { addressChannel: 'postal', tenants: ['scs'] },
      { addressChannel: 'email', tenants: ['kring'] },
    ]);
    expect(await syncResidenceTenants(db, 'person.p1', ['scs'])).toBe(2);
    expect(where).toHaveBeenCalledWith('parentKey', '==', 'person.p1');
    expect(docs[0].ref.update).toHaveBeenCalledWith({ tenants: ['scs'] });
    expect(docs[1].ref.update).toHaveBeenCalledWith({ tenants: ['scs'] });
    expect(docs[2].ref.update).not.toHaveBeenCalled();
    expect(docs[3].ref.update).not.toHaveBeenCalled();
  });

  it('narrows a row sharing no tenant with the parent to [] (revocation and injection)', async () => {
    const { db, docs } = dbWith([
      { addressChannel: 'postal', tenants: ['kring'] },
      { addressChannel: 'postal', tenants: ['scs', 'x'] },
      { addressChannel: 'postal', tenants: [] },
    ]);
    expect(await syncResidenceTenants(db, 'person.p1', ['scs'])).toBe(2);
    expect(docs[0].ref.update).toHaveBeenCalledWith({ tenants: [] });
    expect(docs[1].ref.update).toHaveBeenCalledWith({ tenants: ['scs'] });
    expect(docs[2].ref.update).not.toHaveBeenCalled();
  });

  it('widens [scs] to the parent\'s [scs, kring]', async () => {
    const { db, docs } = dbWith([{ addressChannel: 'postal', tenants: ['scs'] }]);
    expect(await syncResidenceTenants(db, 'person.p1', ['scs', 'kring'])).toBe(1);
    expect(docs[0].ref.update).toHaveBeenCalledWith({ tenants: ['scs', 'kring'] });
  });
});

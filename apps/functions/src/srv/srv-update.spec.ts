import { describe, expect, it, vi } from 'vitest';
import type { SrvChanges } from '@okr/shared-models';

import {
  buildSrvCreatePayload,
  changedFields,
  ignoredFields,
  mergeSrvRecord,
  runSrvPreview,
  runSrvUpdate,
  stripTestEmail,
  type SrvRead,
} from './srv-update';

/** A detail record as Regasoft returns it (PortalTest: emails carry the trailing `x`). */
const RAW: Record<string, unknown> = {
  id: 26183,
  serviceId: 12345,
  salutation: 'Herr',
  firstName: 'Bruno',
  lastName: 'Kaiser',
  birthday: '1963-04-12T00:00:00',
  gender: 1,
  nationIOC: 'SUI',
  language: 1,
  membershipType: 'Active',
  hasNewsletter: true,
  hasLicense: false,
  licenseId: null,
  licenseValidUntil: null,
  street: 'Seestrasse 1',
  streetAdditional: null,
  postcode: '8712',
  city: 'Stäfa',
  countryName: 'CH',
  countryId: 3,
  telefon: null,
  mobile: '079 123 45 67',
  email: 'bruno@example.chx',
  entryDate: '2013-03-12T00:00:00',
  inactive: false,
  inactiveDate: null,
  dateOfDeath: null,
  leavingDate: null,
  personClubs: [{ personId: 1, personFullname: 'Bruno Kaiser', clubName: 'SCS', clubId: 9, mainClub: true }],
};

const PROD = { testSystem: false };
const TEST = { testSystem: true };

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return (e as { code?: string }).code;
  }
  return undefined;
}

describe('mergeSrvRecord', () => {
  it('keeps fields our model does not know (D1) and sets the change', () => {
    const merged = mergeSrvRecord({ ...RAW, newField: 'x', entryDate: '2013-03-12T00:00:00' }, { city: 'Uster' }, PROD);
    expect(merged['newField']).toBe('x');
    expect(merged['entryDate']).toBe('2013-03-12T00:00:00');
    expect(merged['city']).toBe('Uster');
  });

  it('sends back every key of the raw record, unchanged except the change', () => {
    const merged = mergeSrvRecord(RAW, { city: 'Uster' }, PROD);
    expect(merged).toEqual({ ...RAW, city: 'Uster' });
  });

  it('does not mutate the raw record', () => {
    const raw = { ...RAW };
    mergeSrvRecord(raw, { city: 'Uster' }, PROD);
    expect(raw).toEqual(RAW);
  });

  it('rejects a key that Regasoft does not accept', () => {
    expect(codeOf(() => mergeSrvRecord(RAW, { membershipType: 'Passive' } as unknown as SrvChanges, PROD))).toBe('invalid-argument');
    expect(codeOf(() => mergeSrvRecord(RAW, { id: 1 } as unknown as SrvChanges, PROD))).toBe('invalid-argument');
  });

  it('rejects a change value that is not a string, a number or null', () => {
    for (const bad of [true, {}, ['Uster'], { toString: () => 'Uster' }]) {
      expect(codeOf(() => mergeSrvRecord(RAW, { city: bad } as unknown as SrvChanges, PROD))).toBe('invalid-argument');
    }
    expect(codeOf(() => mergeSrvRecord(RAW, { gender: false } as unknown as SrvChanges, PROD))).toBe('invalid-argument');
    expect(codeOf(() => mergeSrvRecord(RAW, { leavingDate: {} } as unknown as SrvChanges, PROD))).toBe('invalid-argument');
  });

  it('rejects changes that are not an object', () => {
    expect(codeOf(() => mergeSrvRecord(RAW, null as unknown as SrvChanges, PROD))).toBe('invalid-argument');
    expect(codeOf(() => mergeSrvRecord(RAW, [] as unknown as SrvChanges, PROD))).toBe('invalid-argument');
  });

  it('clears a date with an empty value', () => {
    expect(mergeSrvRecord({ ...RAW, leavingDate: '2020-01-01T00:00:00' }, { leavingDate: '' }, PROD)['leavingDate']).toBeNull();
    expect(mergeSrvRecord({ ...RAW, inactiveDate: '2020-01-01T00:00:00' }, { inactiveDate: null }, PROD)['inactiveDate']).toBeNull();
  });

  it('converts a StoreDate to the Regasoft date format', () => {
    expect(mergeSrvRecord(RAW, { inactiveDate: '20260101' }, PROD)['inactiveDate']).toBe('2026-01-01T00:00:00');
  });

  it('keeps Regasoft\'s birthday when the change is only a partial date', () => {
    expect(mergeSrvRecord(RAW, { birthday: '19630000' }, PROD)['birthday']).toBe(RAW['birthday']);
  });

  it('rejects a partial date for a status field instead of clearing it', () => {
    expect(codeOf(() => mergeSrvRecord({ ...RAW, leavingDate: '2020-01-01T00:00:00' }, { leavingDate: '20260000' }, PROD))).toBe('invalid-argument');
  });

  it('never sends the no-exit placeholder as a date', () => {
    expect(codeOf(() => mergeSrvRecord(RAW, { leavingDate: '99991231' }, PROD))).toBe('invalid-argument');
  });

  it('fails with a clear message when the record has no birthday', () => {
    const { birthday: _birthday, ...noBirthday } = RAW;
    let err: { code?: string; message?: string } = {};
    try {
      mergeSrvRecord(noBirthday, {}, PROD);
    } catch (e) {
      err = e as typeof err;
    }
    expect(err.code).toBe('failed-precondition');
    expect(err.message).toBe('Regasoft verlangt Geburtsdatum und Geschlecht');
  });

  it('fails when the merged record has no gender', () => {
    expect(codeOf(() => mergeSrvRecord({ ...RAW, gender: null }, { city: 'Uster' }, PROD))).toBe('failed-precondition');
    expect(codeOf(() => mergeSrvRecord(RAW, { gender: '' }, PROD))).toBe('failed-precondition');
  });

  it('writes gender and countryId as numbers', () => {
    const merged = mergeSrvRecord(RAW, { gender: '2', countryId: '3' }, PROD);
    expect(merged['gender']).toBe(2);
    expect(merged['countryId']).toBe(3);
    expect(codeOf(() => mergeSrvRecord(RAW, { countryId: 'CH' }, PROD))).toBe('invalid-argument');
  });

  it('clears a text field with an empty value', () => {
    expect(mergeSrvRecord({ ...RAW, telefon: '044 000 00 00' }, { telefon: '' }, PROD)['telefon']).toBeNull();
  });

  it('appends the test x to a changed email in the test system', () => {
    expect(mergeSrvRecord(RAW, { email: 'a@b.ch' }, TEST)['email']).toBe('a@b.chx');
  });

  it('leaves an unchanged email raw in the test system', () => {
    expect(mergeSrvRecord(RAW, { city: 'Uster' }, TEST)['email']).toBe('bruno@example.chx');
  });

  it('writes a changed email as it is in production', () => {
    expect(mergeSrvRecord(RAW, { email: 'a@b.ch' }, PROD)['email']).toBe('a@b.ch');
  });

  it('clears an email without appending the x', () => {
    expect(mergeSrvRecord(RAW, { email: '' }, TEST)['email']).toBeNull();
  });
});

describe('stripTestEmail', () => {
  it('removes the trailing x in the test system', () => {
    expect(stripTestEmail('a@b.chx', true)).toBe('a@b.ch');
  });
  it('leaves emails alone in production', () => {
    expect(stripTestEmail('a@b.chx', false)).toBe('a@b.chx');
  });
  it('leaves empty values alone', () => {
    expect(stripTestEmail(null, true)).toBeNull();
    expect(stripTestEmail('', true)).toBe('');
  });
  it('leaves an email without the x alone', () => {
    expect(stripTestEmail('a@b.ch', true)).toBe('a@b.ch');
  });
});

describe('ignoredFields / changedFields', () => {
  it('reports nothing when Regasoft kept what we sent', () => {
    expect(ignoredFields({ hasNewsletter: false, city: 'Uster' }, { hasNewsletter: true, city: 'Uster' }, ['city'])).toEqual([]);
  });

  it('reports a field Regasoft did not take', () => {
    expect(ignoredFields({ hasNewsletter: false, city: 'Uster' }, { hasNewsletter: true, city: 'Stäfa' }, ['city'])).toEqual(['city']);
  });

  it('treats null, undefined and empty as the same value', () => {
    expect(ignoredFields({ telefon: null }, { telefon: '' }, ['telefon'])).toEqual([]);
    expect(ignoredFields({ telefon: null }, {}, ['telefon'])).toEqual([]);
  });

  it('compares dates by day', () => {
    expect(ignoredFields({ inactiveDate: '2026-01-01T00:00:00' }, { inactiveDate: '2026-01-01T00:00:00.000' }, ['inactiveDate'])).toEqual([]);
  });

  it('lists the writable fields a payload changes', () => {
    expect(changedFields(RAW, { ...RAW, city: 'Uster', hasNewsletter: false })).toEqual(['city']);
  });
});

describe('runSrvUpdate', () => {
  const fakeRead = (records: Record<string, unknown>[]): SrvRead => {
    let i = 0;
    return vi.fn(async () => records[Math.min(i++, records.length - 1)]);
  };

  it('update re-reads after preview — the PUT is built from the fresh record', async () => {
    const A = { ...RAW, street: 'Alte Strasse 1' };
    const B = { ...RAW, street: 'Neue Strasse 9', telefon: '044 111 22 33' };
    const read = fakeRead([A, B, { ...B, city: 'Uster' }]);
    const write = vi.fn(async () => undefined);

    const preview = await runSrvPreview({ rid: 26183, changes: { city: 'Uster' }, testSystem: false, read });
    expect(preview.payload['street']).toBe('Alte Strasse 1');

    await runSrvUpdate({ rid: 26183, changes: { city: 'Uster' }, testSystem: false, read, write });
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith(26183, { ...B, city: 'Uster' });
  });

  it('reads, writes, reads back and reports written and ignored fields', async () => {
    const after = { ...RAW, city: 'Uster', telefon: null };
    const read = fakeRead([RAW, after]);
    const write = vi.fn(async () => undefined);
    const onWritten = vi.fn(async () => undefined);

    const res = await runSrvUpdate({ rid: 26183, changes: { city: 'Uster', telefon: '044 111 22 33' }, testSystem: false, read, write, onWritten });

    expect(read).toHaveBeenCalledTimes(2);
    expect(onWritten).toHaveBeenCalledTimes(1);
    expect(res.before).toEqual(RAW);
    expect(res.after).toEqual(after);
    expect(res.written).toEqual(['city']);
    expect(res.ignored).toEqual(['telefon']);
  });

  it('test system: PUT body stays raw, before and after come back without the x', async () => {
    const after = { ...RAW, email: 'a@b.chx' };
    const read = fakeRead([RAW, after]);
    const write = vi.fn(async () => undefined);

    const res = await runSrvUpdate({ rid: 26183, changes: { email: 'a@b.ch' }, testSystem: true, read, write });

    expect(write).toHaveBeenCalledWith(26183, { ...RAW, email: 'a@b.chx' });
    expect(res.before['email']).toBe('bruno@example.ch');
    expect(res.after['email']).toBe('a@b.ch');
    // The comparison runs on the raw values: Regasoft took the email.
    expect(res.written).toEqual(['email']);
    expect(res.ignored).toEqual([]);
  });

  it('test system: nothing to send still returns display copies', async () => {
    const res = await runSrvUpdate({ rid: 26183, changes: { city: 'Stäfa' }, testSystem: true, read: fakeRead([RAW]), write: vi.fn() });
    expect(res.before['email']).toBe('bruno@example.ch');
    expect(res.after['email']).toBe('bruno@example.ch');
  });

  it('sends nothing when the changes do not change the record', async () => {
    const read = fakeRead([RAW]);
    const write = vi.fn(async () => undefined);
    const res = await runSrvUpdate({ rid: 26183, changes: { city: 'Stäfa' }, testSystem: false, read, write });
    expect(write).not.toHaveBeenCalled();
    expect(res).toEqual({ before: RAW, after: RAW, written: [], ignored: [] });
  });

  it('sends nothing when the merge fails', async () => {
    const read = fakeRead([RAW]);
    const write = vi.fn(async () => undefined);
    await expect(runSrvUpdate({ rid: 26183, changes: { membershipType: 'Passive' } as unknown as SrvChanges, testSystem: false, read, write }))
      .rejects.toMatchObject({ code: 'invalid-argument' });
    expect(write).not.toHaveBeenCalled();
  });

  it('is not-found when Regasoft has no record', async () => {
    const write = vi.fn(async () => undefined);
    await expect(runSrvUpdate({ rid: 1, changes: { city: 'Uster' }, testSystem: false, read: async () => null, write }))
      .rejects.toMatchObject({ code: 'not-found' });
    expect(write).not.toHaveBeenCalled();
  });

  it('refuses to write when Regasoft answers with another record', async () => {
    const write = vi.fn(async () => undefined);
    await expect(runSrvUpdate({ rid: 1, changes: { city: 'Uster' }, testSystem: false, read: async () => RAW, write }))
      .rejects.toMatchObject({ code: 'internal' });
    expect(write).not.toHaveBeenCalled();
  });

  it('invalidates even when the read-back fails', async () => {
    let i = 0;
    const read: SrvRead = async () => {
      if (i++ === 0) return RAW;
      throw new Error('read-back failed');
    };
    const onWritten = vi.fn(async () => undefined);
    await expect(runSrvUpdate({ rid: 26183, changes: { city: 'Uster' }, testSystem: false, read, write: async () => undefined, onWritten }))
      .rejects.toThrow('read-back failed');
    expect(onWritten).toHaveBeenCalledTimes(1);
  });

  it('says the record was sent but not confirmed when the read-back fails', async () => {
    let i = 0;
    const read: SrvRead = async () => {
      if (i++ === 0) return RAW;
      throw new Error('socket hang up');
    };
    const write = vi.fn(async () => undefined);
    const err = await runSrvUpdate({ rid: 26183, changes: { city: 'Uster' }, testSystem: false, read, write }).catch((e: unknown) => e);
    expect(write).toHaveBeenCalledTimes(1);
    expect(err).toMatchObject({ code: 'unknown' });
    expect((err as Error).message).toMatch(/sent to Regasoft but not confirmed/);
    expect((err as Error).message).toContain('socket hang up');
  });

  it('a read failing BEFORE the PUT keeps its own error (nothing was sent)', async () => {
    const read: SrvRead = async () => { throw new Error('first read failed'); };
    const write = vi.fn(async () => undefined);
    await expect(runSrvUpdate({ rid: 26183, changes: { city: 'Uster' }, testSystem: false, read, write })).rejects.toThrow('first read failed');
    expect(write).not.toHaveBeenCalled();
  });
});

describe('runSrvPreview', () => {
  it('returns before, after and the exact payload, and writes nothing', async () => {
    const res = await runSrvPreview({ rid: 26183, changes: { city: 'Uster' }, testSystem: false, read: async () => RAW });
    expect(res.before).toEqual(RAW);
    expect(res.payload).toEqual({ ...RAW, city: 'Uster' });
    expect(res.after).toEqual(res.payload);
  });

  it('test system: before and after are display copies without the x, the payload stays raw', async () => {
    const res = await runSrvPreview({ rid: 26183, changes: { email: 'a@b.ch' }, testSystem: true, read: async () => RAW });
    expect(res.before).toEqual({ ...RAW, email: 'bruno@example.ch' });
    expect(res.payload).toEqual({ ...RAW, email: 'a@b.chx' });
    expect(res.after).toEqual({ ...RAW, email: 'a@b.ch' });
  });

  it('test system: an unchanged email keeps its x in the payload', async () => {
    const res = await runSrvPreview({ rid: 26183, changes: { city: 'Uster' }, testSystem: true, read: async () => RAW });
    expect(res.before['email']).toBe('bruno@example.ch');
    expect(res.payload['email']).toBe('bruno@example.chx');
  });
});

describe('buildSrvCreatePayload', () => {
  const DATA = {
    firstName: 'Anna',
    lastName: 'Muster',
    fullname: 'Anna Muster',
    email: 'anna@example.ch',
    mobile: '079 000 00 00',
    dateOfBirth: '19900102',
    gender: 2,
    membershipType: 'Active',
    nationIOC: 'SUI',
    language: 1,
    hasNewsletter: true,
    hasLicense: false,
    street: 'Weg 1',
    streetAdditional: null,
    postcode: '8712',
    city: 'Stäfa',
    countryName: 'CH',
    countryId: '3',
    telefon: null,
  };

  it('sends only the writable fields plus id 0', () => {
    expect(buildSrvCreatePayload(DATA, false)).toEqual({
      id: 0,
      firstName: 'Anna',
      lastName: 'Muster',
      email: 'anna@example.ch',
      mobile: '079 000 00 00',
      birthday: '1990-01-02T00:00:00',
      gender: 2,
      street: 'Weg 1',
      streetAdditional: null,
      postcode: '8712',
      city: 'Stäfa',
      countryId: 3,
      telefon: null,
    });
  });

  it('sends inactiveDate for a passive member', () => {
    expect(buildSrvCreatePayload({ ...DATA, inactiveDate: '20260101' }, false)['inactiveDate']).toBe('2026-01-01T00:00:00');
  });

  it('sets no inactiveDate without one, or for a non-full or placeholder value', () => {
    expect(buildSrvCreatePayload(DATA, false)).not.toHaveProperty('inactiveDate');
    expect(buildSrvCreatePayload({ ...DATA, inactiveDate: '' }, false)).not.toHaveProperty('inactiveDate');
    expect(buildSrvCreatePayload({ ...DATA, inactiveDate: '20260000' }, false)).not.toHaveProperty('inactiveDate');
    expect(buildSrvCreatePayload({ ...DATA, inactiveDate: '99991231' }, false)).not.toHaveProperty('inactiveDate');
  });

  it('appends the test x to the email in the test system', () => {
    expect(buildSrvCreatePayload(DATA, true)['email']).toBe('anna@example.chx');
  });

  it('requires a full birthday and a gender', () => {
    expect(codeOf(() => buildSrvCreatePayload({ ...DATA, dateOfBirth: '19900000' }, false))).toBe('failed-precondition');
  });
});

import { describe, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';

import { ADDRESS_REGISTER_TENANT } from '@okr/shared-constants';

import {
  buildRegisterLocation,
  findOrCreateRegisterLocation,
  isRegisterLocation,
  ManualAddressInput,
  snapshotFromLocation,
} from './address-register.util';
import { SwissAddressHit } from './swisstopo.util';

const HIT: SwissAddressHit = {
  egaid: '101880576',
  streetName: 'Seestrasse',
  streetNumber: '12',
  zipCode: '8712',
  city: 'Stäfa',
  latitude: 47.239643,
  longitude: 8.715611,
  label: 'Seestrasse 12 8712 Stäfa',
};

const MANUAL: ManualAddressInput = {
  streetName: 'Hauptstrasse',
  streetNumber: '5a',
  zipCode: '78462',
  city: 'Konstanz',
  countryCode: 'DE',
};

describe('buildRegisterLocation', () => {
  it('builds a swisstopo register location with the egaid as a string property', () => {
    const loc = buildRegisterLocation(HIT);
    expect(loc.type).toBe('address');
    expect(loc.name).toBe('Seestrasse 12, 8712 Stäfa');
    expect(loc.address).toBe('Seestrasse 12, 8712 Stäfa');
    expect(loc.latitude).toBe(47.239643);
    expect(loc.longitude).toBe(8.715611);
    expect(loc.tenants).toEqual([ADDRESS_REGISTER_TENANT]);
    expect(loc.isArchived).toBe(false);
    expect(loc.okey).toBe('');
    expect(loc.properties).toEqual([
      { key: 'egaid', value: '101880576' },
      { key: 'countryCode', value: 'CH' },
      { key: 'validated', value: 'swisstopo' },
    ]);
    // the egaid map must hold exactly key + value so the array-contains lookup matches
    expect(Object.keys(loc.properties[0])).toEqual(['key', 'value']);
    expect(typeof loc.properties[0].value).toBe('string');
  });

  it('builds a manual register location without egaid and without coordinates', () => {
    const loc = buildRegisterLocation(MANUAL);
    expect(loc.type).toBe('address');
    expect(loc.name).toBe('Hauptstrasse 5a, 78462 Konstanz');
    expect(loc.address).toBe(loc.name);
    expect(loc.latitude).toBe(0);
    expect(loc.longitude).toBe(0);
    expect(loc.tenants).toEqual([ADDRESS_REGISTER_TENANT]);
    expect(loc.properties).toEqual([
      { key: 'countryCode', value: 'DE' },
      { key: 'validated', value: 'manual' },
    ]);
  });

  it('leaves out empty parts of the text', () => {
    expect(buildRegisterLocation({ ...MANUAL, streetNumber: '' }).name).toBe('Hauptstrasse, 78462 Konstanz');
    expect(buildRegisterLocation({ ...MANUAL, zipCode: '' }).name).toBe('Hauptstrasse 5a, Konstanz');
  });

  it('upper-cases a manual country code', () => {
    expect(buildRegisterLocation({ ...MANUAL, countryCode: 'de' }).properties).toContainEqual({ key: 'countryCode', value: 'DE' });
  });
});

describe('snapshotFromLocation', () => {
  it('round-trips a swisstopo hit', () => {
    expect(snapshotFromLocation(buildRegisterLocation(HIT))).toEqual({
      streetName: 'Seestrasse',
      streetNumber: '12',
      zipCode: '8712',
      city: 'Stäfa',
      countryCode: 'CH',
    });
  });

  it('round-trips a manual input', () => {
    expect(snapshotFromLocation(buildRegisterLocation(MANUAL))).toEqual(MANUAL);
  });

  it('round-trips multi-word streets and cities and a missing number', () => {
    const input: ManualAddressInput = { streetName: 'Rue du Lac', streetNumber: '', zipCode: '1800', city: 'Vevey La Tour', countryCode: 'CH' };
    expect(snapshotFromLocation(buildRegisterLocation(input))).toEqual(input);
  });

  it('round-trips a missing zip code', () => {
    const input: ManualAddressInput = { streetName: 'Main Street', streetNumber: '1', zipCode: '', city: 'Dublin', countryCode: 'IE' };
    expect(snapshotFromLocation(buildRegisterLocation(input))).toEqual(input);
  });
});

describe('isRegisterLocation', () => {
  it('is true only when the register marker is among the tenants', () => {
    expect(isRegisterLocation({ tenants: [ADDRESS_REGISTER_TENANT] })).toBe(true);
    expect(isRegisterLocation({ tenants: ['scs'] })).toBe(false);
    expect(isRegisterLocation({})).toBe(false);
    expect(isRegisterLocation(undefined)).toBe(false);
  });
});

describe('findOrCreateRegisterLocation', () => {
  function fakeDb(existing: { id: string; tenants: string[] }[]) {
    const where = vi.fn();
    const txGet = vi.fn().mockResolvedValue({ docs: existing.map((e) => ({ id: e.id, data: () => ({ tenants: e.tenants }) })) });
    const txSet = vi.fn();
    const plainSet = vi.fn().mockResolvedValue(undefined);
    const newRef = { id: 'new-key', set: plainSet };
    const query = { where };
    where.mockReturnValue(query);
    const collection = vi.fn(() => ({ where, doc: () => newRef }));
    const runTransaction = vi.fn(async (fn: (tx: unknown) => Promise<string>) => fn({ get: txGet, set: txSet }));
    const db = { collection, runTransaction } as unknown as Firestore;
    return { db, where, txGet, txSet, plainSet, runTransaction, collection };
  }

  it('returns the existing register location for a known egaid', async () => {
    const f = fakeDb([{ id: 'club-loc', tenants: ['scs'] }, { id: 'reg-loc', tenants: [ADDRESS_REGISTER_TENANT] }]);
    expect(await findOrCreateRegisterLocation(f.db, HIT)).toBe('reg-loc');
    expect(f.collection).toHaveBeenCalledWith('locations');
    expect(f.where).toHaveBeenCalledWith('properties', 'array-contains', { key: 'egaid', value: '101880576' });
    expect(f.txSet).not.toHaveBeenCalled();
  });

  it('creates the location inside the transaction when the egaid is unknown', async () => {
    const f = fakeDb([]);
    expect(await findOrCreateRegisterLocation(f.db, HIT)).toBe('new-key');
    expect(f.txSet).toHaveBeenCalledTimes(1);
    const written = f.txSet.mock.calls[0][1];
    expect(Object.getPrototypeOf(written)).toBe(Object.prototype);
    expect(written).not.toHaveProperty('okey');
    expect(written.tenants).toEqual([ADDRESS_REGISTER_TENANT]);
    expect(written.properties).toContainEqual({ key: 'egaid', value: '101880576' });
  });

  it('always creates a manual location, without a transaction', async () => {
    const f = fakeDb([]);
    expect(await findOrCreateRegisterLocation(f.db, MANUAL)).toBe('new-key');
    expect(f.runTransaction).not.toHaveBeenCalled();
    expect(f.plainSet).toHaveBeenCalledTimes(1);
    expect(f.plainSet.mock.calls[0][0].properties).toContainEqual({ key: 'validated', value: 'manual' });
  });
});

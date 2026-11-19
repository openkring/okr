import type { Firestore } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';

import { AddressModel } from '@okr/shared-models';

import { payeeFromAddresses, resolvePersonPayee } from './qr-slip';

const IBAN = 'CH9300762011623852957';
const QR_IBAN = 'CH4431999123000889012';

function address(patch: Partial<AddressModel>): AddressModel {
  return Object.assign(new AddressModel('scs'), patch);
}

const bank = (patch: Partial<AddressModel> = {}) =>
  address({ okey: 'bank1', addressChannel: 'bankaccount', iban: IBAN, parentKey: 'person.p1', ...patch });
const postal = (patch: Partial<AddressModel> = {}) =>
  address({ okey: 'postal1', addressChannel: 'postal', streetName: 'Seestrasse', streetNumber: '12', zipCode: '8712', city: 'Stäfa', countryCode: 'CH', parentKey: 'person.p1', ...patch });

/** A Firestore stand-in that serves `addresses/{id}` from a map. */
function fakeDb(docs: Record<string, AddressModel>): Firestore {
  return {
    collection: (name: string) => ({
      doc: (id: string) => ({
        get: async () => {
          const d = name === 'addresses' ? docs[id] : undefined;
          return { exists: !!d, id, data: () => (d ? { ...d } : undefined) };
        },
      }),
    }),
  } as unknown as Firestore;
}

describe('payeeFromAddresses', () => {
  it('takes the IBAN from the bank address and the postal parts from the postal address', () => {
    expect(payeeFromAddresses('Muster Sport', bank(), postal())).toEqual({
      name: 'Muster Sport',
      iban: IBAN,
      qrIban: '',
      regularIban: IBAN,
      street: 'Seestrasse',
      buildingNumber: '12',
      zip: '8712',
      city: 'Stäfa',
      country: 'CH',
    });
  });

  it('leaves the IBAN empty without a bank address', () => {
    const p = payeeFromAddresses('Muster Sport', undefined, postal());
    expect(p.iban).toBe('');
    expect(p.regularIban).toBe('');
    expect(p.city).toBe('Stäfa');
  });

  it('defaults the country to CH and leaves the postal parts empty without a postal address', () => {
    const p = payeeFromAddresses('Muster Sport', bank(), undefined);
    expect(p).toMatchObject({ street: '', zip: '', city: '', country: 'CH' });
  });

  it('files a QR-IBAN as qrIban, not as regular IBAN', () => {
    const p = payeeFromAddresses('Muster Sport', bank({ iban: QR_IBAN }), postal());
    expect(p).toMatchObject({ iban: QR_IBAN, qrIban: QR_IBAN, regularIban: '' });
  });

  it('ignores an address of the wrong channel or an archived one', () => {
    expect(payeeFromAddresses('X', bank({ addressChannel: 'email' }), postal()).iban).toBe('');
    expect(payeeFromAddresses('X', bank({ isArchived: true }), postal()).iban).toBe('');
    expect(payeeFromAddresses('X', bank(), postal({ addressChannel: 'bankaccount' })).city).toBe('');
  });
});

describe('resolvePersonPayee', () => {
  it('reads both addresses of the person', async () => {
    const db = fakeDb({ bank1: bank(), postal1: postal() });
    const p = await resolvePersonPayee(db, 'Muster Sport', 'bank1', 'postal1', 'p1');
    expect(p).toMatchObject({ name: 'Muster Sport', iban: IBAN, regularIban: IBAN, street: 'Seestrasse', zip: '8712', city: 'Stäfa' });
  });

  it('refuses a bank address of another person (empty IBAN)', async () => {
    const db = fakeDb({ bank1: bank({ parentKey: 'person.p2' }), postal1: postal() });
    const p = await resolvePersonPayee(db, 'Muster Sport', 'bank1', 'postal1', 'p1');
    expect(p.iban).toBe('');
    expect(p.regularIban).toBe('');
    expect(p.city).toBe('Stäfa');
  });

  it('refuses an org address and a raw okey parentKey', async () => {
    const asOrg = await resolvePersonPayee(fakeDb({ bank1: bank({ parentKey: 'org.p1' }) }), 'X', 'bank1', '', 'p1');
    expect(asOrg.iban).toBe('');
    const rawKey = await resolvePersonPayee(fakeDb({ bank1: bank({ parentKey: 'p1' }) }), 'X', 'bank1', '', 'p1');
    expect(rawKey.iban).toBe('');
  });

  it('refuses a postal address of another person', async () => {
    const db = fakeDb({ bank1: bank(), postal1: postal({ parentKey: 'person.p2' }) });
    const p = await resolvePersonPayee(db, 'X', 'bank1', 'postal1', 'p1');
    expect(p).toMatchObject({ iban: IBAN, street: '', zip: '', city: '' });
  });

  it('refuses a bank key that points at a non-bank address', async () => {
    const db = fakeDb({ postal1: postal() });
    const p = await resolvePersonPayee(db, 'X', 'postal1', 'postal1', 'p1');
    expect(p.iban).toBe('');
    expect(p.city).toBe('Stäfa');
  });

  it('returns empty parts for missing documents, empty keys or an empty personKey', async () => {
    const db = fakeDb({ bank1: bank({ parentKey: 'person.' }), postal1: postal() });
    expect((await resolvePersonPayee(db, 'X', 'missing', 'missing', 'p1')).iban).toBe('');
    expect((await resolvePersonPayee(db, 'X', '', '', 'p1')).city).toBe('');
    expect((await resolvePersonPayee(db, 'X', 'bank1', 'postal1', '')).iban).toBe('');
  });
});

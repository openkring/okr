import { describe, expect, it, vi } from 'vitest';
import { matchActions, buildReceiptPayload } from './booking-action.util';
import { BookingAction } from './booking-action.model';
import { AddressModel } from '../../../../../shared/models/src/lib/address.model';
import { OrgModel } from '../../../../../shared/models/src/lib/org.model';
import { PersonModel } from '../../../../../shared/models/src/lib/person.model';
import * as utilCore from '@bk2/shared-util-core';

// @bk2/shared-util-core re-exports platform.util which imports @angular/common (isPlatformBrowser).
// Vite loads the whole barrel, triggering Angular JIT errors in a non-Angular test env.
// We pass-through all real implementations so convertDateFormatToString/DateFormat work as-is.
vi.mock('@bk2/shared-util-core', async () => {
  const actual = await vi.importActual<typeof utilCore>('@bk2/shared-util-core');
  return { ...actual };
});
vi.mock('@angular/common', () => ({ isPlatformBrowser: vi.fn(() => true) }));

function addr(): AddressModel {
  const a = new AddressModel('gss');
  a.streetName = 'Seestrasse';
  a.streetNumber = '12';
  a.zipCode = '8712';
  a.city = 'Stäfa';
  return a;
}

const RECEIPT: BookingAction = {
  id: 'gss-spende-receipt',
  type: 'generateDocument',
  trigger: { accountingTenantId: 'gss', accountId: '3407' },
  templateId: 'gss-spendenbestaetigung',
  labelKey: '@finance/booking/feature.action.createReceipt',
  icon: 'document',
};
const ACTIONS = [RECEIPT];

describe('matchActions', () => {
  it('returns the action when tenant and account both match', () => {
    expect(matchActions('gss', ['1020', '3407'], ACTIONS)).toEqual([RECEIPT]);
  });
  it('returns nothing when the account is absent', () => {
    expect(matchActions('gss', ['1020', '3400'], ACTIONS)).toEqual([]);
  });
  it('returns nothing when the tenant differs', () => {
    expect(matchActions('scs', ['3407'], ACTIONS)).toEqual([]);
  });
  it('returns nothing for an empty account list', () => {
    expect(matchActions('gss', [], ACTIONS)).toEqual([]);
  });
});

describe('buildReceiptPayload', () => {
  it('builds a female person payload with "Liebe" greeting and formatted amount', () => {
    const p = new PersonModel('gss');
    p.firstName = 'Anna'; p.lastName = 'Muster'; p.gender = 'female';
    const payload = buildReceiptPayload(
      { kind: 'person', person: p }, addr(), 100000, '20260507',
    );
    expect(payload).toMatchObject({
      greeting: 'Liebe Anna',
      firstName: 'Anna', lastName: 'Muster',
      streetName: 'Seestrasse', streetNumber: '12', zipCode: '8712', city: 'Stäfa',
      date: '07.05.2026',
      amount: "1'000.00",
    });
  });

  it('uses "Lieber" for a male person', () => {
    const p = new PersonModel('gss');
    p.firstName = 'Hans'; p.lastName = 'Muster'; p.gender = 'male';
    const payload = buildReceiptPayload({ kind: 'person', person: p }, addr(), 5000, '20260101');
    expect(payload.greeting).toBe('Lieber Hans');
    expect(payload.amount).toBe('50.00');
  });

  it('builds an org payload with a neutral greeting and org name as lastName', () => {
    const o = new OrgModel('gss');
    o.name = 'Stiftung Test';
    const payload = buildReceiptPayload({ kind: 'org', org: o }, addr(), 250000, '20260507');
    expect(payload).toMatchObject({
      greeting: 'Sehr geehrte Damen und Herren',
      firstName: '', lastName: 'Stiftung Test',
      amount: "2'500.00",
    });
  });
});

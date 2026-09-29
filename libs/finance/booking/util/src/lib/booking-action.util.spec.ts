import { describe, expect, it, vi } from 'vitest';
import { matchActions, buildReceiptPayload, collectReceiptPayments, ReceiptPayment } from './booking-action.util';
import { BookingAction } from './booking-action.model';
import { AddressModel } from '../../../../../shared/models/src/lib/address.model';
import { OrgModel } from '../../../../../shared/models/src/lib/org.model';
import { PersonModel } from '../../../../../shared/models/src/lib/person.model';
import { BookingModel } from '../../../../../shared/models/src/lib/booking.model';
import { BookingLineModel } from '../../../../../shared/models/src/lib/booking-line.model';
import { AvatarInfo } from '../../../../../shared/models/src/lib/avatar-info';
import * as utilCore from '@okr/shared-util-core';

// @okr/shared-util-core re-exports platform.util which imports @angular/common (isPlatformBrowser).
// Vite loads the whole barrel, triggering Angular JIT errors in a non-Angular test env.
// We pass-through all real implementations so convertDateFormatToString/DateFormat work as-is.
vi.mock('@okr/shared-util-core', async () => {
  const actual = await vi.importActual<typeof utilCore>('@okr/shared-util-core');
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
  trigger: { accountingTenantId: 'gss', accountIds: ['3401', '3407'] },
  templateId: 'gss-spendenbestaetigung',
  labelKey: '@finance/booking/feature.action.createReceipt',
  icon: 'document',
};
const ACTIONS = [RECEIPT];

describe('matchActions', () => {
  it('returns the action when tenant and account both match', () => {
    expect(matchActions('gss', ['1020', '3407'], ACTIONS)).toEqual([RECEIPT]);
  });
  it('matches on any of the trigger accounts', () => {
    expect(matchActions('gss', ['1020', '3401'], ACTIONS)).toEqual([RECEIPT]);
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

const label = (id: string) => (id === '3401' ? 'Mitgliederbeitrag' : 'Spende');
const ONE: ReceiptPayment[] = [{ date: '20260507', accountId: '3407', amountRappen: 100000 }];

describe('buildReceiptPayload', () => {
  // Intl.NumberFormat('de-CH') renders the thousands separator with a codepoint that varies
  // by ICU/CLDR version (U+0027 ' vs U+2019 ’ vs NBSP), and nx may run test tasks under
  // different Node versions. Normalize the separator before asserting — the glyph is a
  // presentation detail, not business logic — so the test is deterministic across runtimes.
  const normSep = (s: unknown) => String(s).replace(/[\u2019\u00A0\u202F\u2009]/g, "'");

  it('builds a female person payload with "Liebe" greeting and formatted amount', () => {
    const p = new PersonModel('gss');
    p.firstName = 'Anna'; p.lastName = 'Muster'; p.gender = 'female';
    const payload = buildReceiptPayload({ kind: 'person', person: p }, addr(), ONE, 2026, label);
    expect(payload).toMatchObject({
      greeting: 'Liebe Anna',
      firstName: 'Anna', lastName: 'Muster',
      streetName: 'Seestrasse', streetNumber: '12', zipCode: '8712', city: 'Stäfa',
      date: '07.05.2026', year: '2026',
    });
    expect(normSep(payload['amount'])).toBe("1'000.00");
  });

  it('uses "Lieber" for a male person', () => {
    const p = new PersonModel('gss');
    p.firstName = 'Hans'; p.lastName = 'Muster'; p.gender = 'male';
    const payload = buildReceiptPayload({ kind: 'person', person: p }, addr(), [{ date: '20260101', accountId: '3407', amountRappen: 5000 }], 2026, label);
    expect(payload['greeting']).toBe('Lieber Hans');
    expect(payload['amount']).toBe('50.00');
  });

  it('builds an org payload with a neutral greeting and org name as lastName', () => {
    const o = new OrgModel('gss');
    o.name = 'Stiftung Test';
    const payload = buildReceiptPayload({ kind: 'org', org: o }, addr(), [{ date: '20260507', accountId: '3407', amountRappen: 250000 }], 2026, label);
    expect(payload).toMatchObject({
      greeting: 'Sehr geehrte Damen und Herren',
      firstName: '', lastName: 'Stiftung Test',
    });
    expect(normSep(payload['amount'])).toBe("2'500.00");
  });

  it('lists every payment with its label and sums the total', () => {
    const p = new PersonModel('gss');
    p.firstName = 'Anna'; p.lastName = 'Muster'; p.gender = 'female';
    const payments: ReceiptPayment[] = [
      { date: '20260115', accountId: '3401', amountRappen: 10000 },
      { date: '20260507', accountId: '3407', amountRappen: 25000 },
    ];
    const payload = buildReceiptPayload({ kind: 'person', person: p }, addr(), payments, 2026, label);
    expect(payload['payments']).toEqual([
      { date: '15.01.2026', label: 'Mitgliederbeitrag', amount: '100.00' },
      { date: '07.05.2026', label: 'Spende', amount: '250.00' },
    ]);
    expect(payload['total']).toBe('350.00');
    expect(payload['date']).toBe('07.05.2026');
  });
});

describe('collectReceiptPayments', () => {
  const ACCOUNT_IDS = new Map([['k1020', '1020'], ['k3401', '3401'], ['k3407', '3407']]);
  const ANNA = { key: 'anna', modelType: 'person' } as AvatarInfo;
  const BEN = { key: 'ben', modelType: 'person' } as AvatarInfo;

  function booking(okey: string, date: string, cp: AvatarInfo | undefined, status = 'posted'): BookingModel {
    const b = new BookingModel('scs', 'gss');
    b.okey = okey; b.date = date; b.counterparty = cp; b.status = status as BookingModel['status'];
    return b;
  }
  function line(bookingKey: string, accountKey: string, credit = 0, debit = 0): BookingLineModel {
    const l = new BookingLineModel('scs', 'gss');
    l.bookingKey = bookingKey; l.accountKey = accountKey;
    if (credit) l.creditAmount = { amount: credit, currency: 'CHF', periodicity: 'one-time' } as BookingLineModel['creditAmount'];
    if (debit) l.debitAmount = { amount: debit, currency: 'CHF', periodicity: 'one-time' } as BookingLineModel['debitAmount'];
    return l;
  }
  const bookings = [
    booking('fee', '20260115', ANNA),
    booking('gift', '20260507', ANNA),
    booking('old', '20251231', ANNA),
    booking('other', '20260301', BEN),
    booking('open', '20260601', ANNA, 'forReview'),
    booking('void', '20260701', ANNA, 'cancelled'),
    booking('both', '20260801', ANNA),
  ];
  const lines = new Map<string, BookingLineModel[]>([
    ['fee', [line('fee', 'k1020', 0, 10000), line('fee', 'k3401', 10000)]],
    ['gift', [line('gift', 'k1020', 0, 25000), line('gift', 'k3407', 25000)]],
    ['old', [line('old', 'k3407', 5000)]],
    ['other', [line('other', 'k3407', 7000)]],
    ['open', [line('open', 'k3407', 3000)]],
    ['void', [line('void', 'k3407', 4000)]],
    ['both', [line('both', 'k1020', 0, 15000), line('both', 'k3401', 10000), line('both', 'k3407', 5000)]],
  ]);

  it('collects posted payments of the counterparty in the year, one row per account, oldest first', () => {
    expect(collectReceiptPayments(ANNA, 2026, ['3401', '3407'], bookings, lines, ACCOUNT_IDS)).toEqual([
      { date: '20260115', accountId: '3401', amountRappen: 10000 },
      { date: '20260507', accountId: '3407', amountRappen: 25000 },
      { date: '20260801', accountId: '3401', amountRappen: 10000 },
      { date: '20260801', accountId: '3407', amountRappen: 5000 },
    ]);
  });

  it('includes the triggering booking even when not yet posted, but never a cancelled one', () => {
    const withOpen = collectReceiptPayments(ANNA, 2026, ['3407'], bookings, lines, ACCOUNT_IDS, 'open');
    expect(withOpen.map((p) => p.date)).toEqual(['20260507', '20260601', '20260801']);
    const withVoid = collectReceiptPayments(ANNA, 2026, ['3407'], bookings, lines, ACCOUNT_IDS, 'void');
    expect(withVoid.map((p) => p.date)).toEqual(['20260507', '20260801']);
  });

  it('drops accounts whose net amount is not positive (refunds)', () => {
    const refund = new Map(lines);
    refund.set('gift', [line('gift', 'k3407', 25000), line('gift', 'k3407', 0, 25000)]);
    expect(collectReceiptPayments(ANNA, 2026, ['3407'], bookings, refund, ACCOUNT_IDS).map((p) => p.date)).toEqual(['20260801']);
  });
});

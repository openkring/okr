import { MoneyModel, TrainerAgreementModel, TrainerProfileModel, TrainerService, WorkEntryModel } from '@okr/shared-models';
import { describe, expect, it } from 'vitest';
import {
  agreementsOverlap,
  buildTrainerInvoicePayload,
  defaultQuantity,
  formatInvoiceNo,
  isAgreementActiveOn,
  lastDayOfMonth,
  PricedInvoice,
  priceEntries,
  rateOn,
  roundTo5Rappen,
  sendRefusal,
  templateUsesCounter,
  trainerInvoiceKey,
  trainerInvoiceStateForBill,
} from './trainer-billing.util';

const chf = (amount: number): MoneyModel => new MoneyModel(amount, 'CHF');

function svc(patch: Partial<TrainerService> = {}): TrainerService {
  return {
    key: 'training',
    name: 'Training',
    unit: 'hour',
    rates: [{ validFrom: '20260101', amount: chf(5000) }],
    accountKey: 'acc-training',
    costCenterKey: 'cc-jugend',
    vatCodeKey: '',
    isArchived: false,
    ...patch,
  };
}

function agreement(services: TrainerService[], patch: Partial<TrainerAgreementModel> = {}): TrainerAgreementModel {
  const a = new TrainerAgreementModel('scs');
  a.okey = 'agr1';
  a.accountingTenantId = 'scs';
  a.personKey = 'p1';
  a.person = { key: 'p1', name1: 'Hans', name2: 'Muster', modelType: 'person', type: '', subType: '', label: '' };
  a.validFrom = '20260101';
  a.validTo = '';
  a.selfEmployedConfirmed = true;
  a.services = services;
  return Object.assign(a, patch);
}

function agreementWith(first: number, second: number, changeFrom: string): TrainerAgreementModel {
  return agreement([svc({ rates: [{ validFrom: '20260101', amount: chf(first) }, { validFrom: changeFrom, amount: chf(second) }] })]);
}

let entryNo = 0;
function entry(date: string, quantity: number, serviceKey = 'training', label = ''): WorkEntryModel {
  const e = new WorkEntryModel('scs');
  e.okey = `e${++entryNo}`;
  e.date = date;
  e.quantity = quantity;
  e.serviceKey = serviceKey;
  e.label = label;
  e.agreementKey = 'agr1';
  e.personKey = 'p1';
  return e;
}

const noVat = { registered: false, ratePercentByCode: {} };
const vat81 = { registered: true, ratePercentByCode: { 'MWST-8.1': 8.1 } };

describe('rateOn', () => {
  it('rateOn picks the rate valid on the date', () => {
    const s = svc({ rates: [{ validFrom: '20260101', amount: chf(5000) }, { validFrom: '20260715', amount: chf(5500) }] });
    expect(rateOn(s, '20260714')?.amount).toBe(5000);
    expect(rateOn(s, '20260715')?.amount).toBe(5500);
    expect(rateOn(s, '20251231')).toBeUndefined();
  });

  it('does not rely on the rate history being sorted', () => {
    const s = svc({ rates: [{ validFrom: '20260715', amount: chf(5500) }, { validFrom: '20260101', amount: chf(5000) }] });
    expect(rateOn(s, '20260801')?.amount).toBe(5500);
    expect(rateOn(s, '20260201')?.amount).toBe(5000);
  });
});

describe('isAgreementActiveOn', () => {
  it('is active inside the validity with confirmed self-employment', () => {
    const a = agreement([svc()], { validFrom: '20260101', validTo: '20261231' });
    expect(isAgreementActiveOn(a, '20260101')).toBe(true);
    expect(isAgreementActiveOn(a, '20261231')).toBe(true);
    expect(isAgreementActiveOn(a, '20251231')).toBe(false);
    expect(isAgreementActiveOn(a, '20270101')).toBe(false);
  });

  it('treats an empty validTo as open', () => {
    expect(isAgreementActiveOn(agreement([svc()], { validTo: '' }), '20991231')).toBe(true);
  });

  it('is inactive when archived or self-employment is not confirmed (D9)', () => {
    expect(isAgreementActiveOn(agreement([svc()], { isArchived: true }), '20260701')).toBe(false);
    expect(isAgreementActiveOn(agreement([svc()], { selfEmployedConfirmed: false }), '20260701')).toBe(false);
  });
});

describe('agreementsOverlap', () => {
  it('agreementsOverlap treats an empty validTo as open', () => {
    expect(agreementsOverlap({ validFrom: '20260101', validTo: '' }, { validFrom: '20300101', validTo: '20301231' })).toBe(true);
    expect(agreementsOverlap({ validFrom: '20300101', validTo: '20301231' }, { validFrom: '20260101', validTo: '' })).toBe(true);
    expect(agreementsOverlap({ validFrom: '20260101', validTo: '' }, { validFrom: '20270101', validTo: '' })).toBe(true);
  });

  it('detects touching and disjoint ranges', () => {
    expect(agreementsOverlap({ validFrom: '20260101', validTo: '20260630' }, { validFrom: '20260630', validTo: '20261231' })).toBe(true);
    expect(agreementsOverlap({ validFrom: '20260101', validTo: '20260630' }, { validFrom: '20260701', validTo: '' })).toBe(false);
    expect(agreementsOverlap({ validFrom: '20260701', validTo: '' }, { validFrom: '20260101', validTo: '20260630' })).toBe(false);
  });
});

describe('defaultQuantity', () => {
  const ev = (fullDay: boolean, durationMinutes: number, startDate = '20260710', endDate = '') => ({ fullDay, durationMinutes, startDate, endDate });

  it('defaultQuantity: 120 min → 2 h; 100 min → 1.75 h; full day → 8 h or 1 day; multi-day full day → per day (Review Focus 4)', () => {
    expect(defaultQuantity(ev(false, 120), 'hour')).toBe(2);
    expect(defaultQuantity(ev(false, 100), 'hour')).toBe(1.75);
    expect(defaultQuantity(ev(true, 1440), 'hour')).toBe(8);
    expect(defaultQuantity(ev(true, 1440), 'day')).toBe(1);
    expect(defaultQuantity(ev(true, 1440, '20260710', '20260712'), 'hour')).toBe(8);
    expect(defaultQuantity(ev(true, 1440, '20260710', '20260712'), 'day')).toBe(1);
  });

  it('rounds partial-day events to quarter hours, and to half or whole days', () => {
    expect(defaultQuantity(ev(false, 50), 'hour')).toBe(0.75);
    expect(defaultQuantity(ev(false, 52), 'hour')).toBe(0.75);
    expect(defaultQuantity(ev(false, 53), 'hour')).toBe(1);
    expect(defaultQuantity(ev(false, 299), 'day')).toBe(0.5);
    expect(defaultQuantity(ev(false, 300), 'day')).toBe(1);
  });
});

describe('roundTo5Rappen', () => {
  it('rounds each line to 5 Rappen', () => {
    expect(roundTo5Rappen(1182.5)).toBe(1185);
    expect(roundTo5Rappen(1182)).toBe(1180);
    expect(roundTo5Rappen(1180)).toBe(1180);
    expect(roundTo5Rappen(0)).toBe(0);
  });
});

describe('priceEntries', () => {
  it('priceEntries uses each line\'s own rate across a mid-month change (Review Focus 1)', () => {
    const r = priceEntries([entry('20260710', 2), entry('20260720', 2)], agreementWith(5000, 5500, '20260715'), noVat, 'acc') as PricedInvoice;
    expect(r.lines.map((l) => l.amount)).toEqual([10000, 11000]);
    expect(r.lines.map((l) => l.rate)).toEqual([5000, 5500]);
    expect(r.total).toBe(21000);
  });

  it('reproduces the July 2026 example: 13 lines, CHF 1700.00', () => {
    const hours = [3, 3, 4, 4, 4, 2, 2, 2, 2, 2, 2, 2, 2];
    const entries = hours.map((h, i) => entry(`202607${String(i + 1).padStart(2, '0')}`, h));
    const r = priceEntries(entries, agreement([svc()]), noVat, 'acc') as PricedInvoice;
    expect(r.lines.length).toBe(13);
    expect(r.subtotal).toBe(170000);
    expect(r.vatAmount).toBe(0);
    expect(r.total).toBe(170000);
  });

  it('freezes service name, unit, label and entry key into the line', () => {
    const r = priceEntries([entry('20260710', 1.5, 'training', 'Halle')], agreement([svc()]), noVat, 'acc') as PricedInvoice;
    expect(r.lines[0]).toEqual({
      date: '20260710', serviceKey: 'training', serviceName: 'Training', label: 'Halle',
      quantity: 1.5, unit: 'hour', rate: 5000, amount: 7500, workEntryKey: r.lines[0].workEntryKey,
    });
    expect(r.lines[0].workEntryKey).toMatch(/^e\d+$/);
  });

  it('rounds the line amount to 5 Rappen', () => {
    const r = priceEntries([entry('20260710', 0.25)], agreement([svc({ rates: [{ validFrom: '20260101', amount: chf(4730) }] })]), noVat, 'acc') as PricedInvoice;
    expect(r.lines[0].amount).toBe(1185); // 0.25 × 4730 = 1182.5
  });

  it('rounds quantities to quarter hours and half days', () => {
    const a = agreement([svc(), svc({ key: 'regatta', name: 'Regatta', unit: 'day', rates: [{ validFrom: '20260101', amount: chf(30000) }] })]);
    const r = priceEntries([entry('20260710', 1.3), entry('20260711', 0.7, 'regatta')], a, noVat, 'acc') as PricedInvoice;
    expect(r.lines.map((l) => l.quantity)).toEqual([1.25, 0.5]);
  });

  it('sorts lines by date, then by service key', () => {
    const a = agreement([svc(), svc({ key: 'regatta', name: 'Regatta' })]);
    const r = priceEntries([entry('20260720', 1), entry('20260710', 1, 'training'), entry('20260710', 1, 'regatta')], a, noVat, 'acc') as PricedInvoice;
    expect(r.lines.map((l) => `${l.date}/${l.serviceKey}`)).toEqual(['20260710/regatta', '20260710/training', '20260720/training']);
  });

  it('adds VAT only when the trainer is registered', () => {
    const a = agreement([svc({ vatCodeKey: 'MWST-8.1' })]);
    const reg = priceEntries([entry('20260710', 2)], a, vat81, 'acc') as PricedInvoice;
    expect(reg.subtotal).toBe(10000);
    expect(reg.vatAmount).toBe(810);
    expect(reg.total).toBe(10810);
    expect(reg.billLines).toEqual([{ title: 'Training', accountKey: 'acc-training', costCenterKey: 'cc-jugend', vatCodeKey: 'MWST-8.1', amount: 10810 }]);

    const unreg = priceEntries([entry('20260710', 2)], a, { registered: false, ratePercentByCode: { 'MWST-8.1': 8.1 } }, 'acc') as PricedInvoice;
    expect(unreg.vatAmount).toBe(0);
    expect(unreg.total).toBe(10000);
    expect(unreg.billLines[0].vatCodeKey).toBe(''); // D10: ignored when not registered
  });

  it('rounds VAT to 5 Rappen per VAT code', () => {
    const a = agreement([svc({ vatCodeKey: 'MWST-8.1', rates: [{ validFrom: '20260101', amount: chf(4730) }] })]);
    const r = priceEntries([entry('20260710', 1)], a, vat81, 'acc') as PricedInvoice;
    expect(r.vatAmount).toBe(385); // 4730 × 8.1 % = 383.13
    expect(r.total).toBe(5115);
  });

  it('refuses a registered trainer whose service has no VAT code', () => {
    const res = priceEntries([entry('20260710', 2)], agreement([svc({ vatCodeKey: '' })]), vat81, 'acc');
    expect(res).toEqual({ error: 'no-vat-code', serviceKey: 'training' });
  });

  it('refuses a registered trainer whose VAT code has no known rate', () => {
    const res = priceEntries([entry('20260710', 2)], agreement([svc({ vatCodeKey: 'MWST-unknown' })]), vat81, 'acc');
    expect(res).toEqual({ error: 'no-vat-code', serviceKey: 'training' });
  });

  it('refuses an entry without a rate on its date, or with a missing or archived service', () => {
    const late = agreement([svc({ rates: [{ validFrom: '20260801', amount: chf(5000) }] })]);
    expect(priceEntries([entry('20260710', 2)], late, noVat, 'acc')).toEqual({ error: 'no-rate', serviceKey: 'training' });
    expect(priceEntries([entry('20260710', 2, 'ghost')], agreement([svc()]), noVat, 'acc')).toEqual({ error: 'no-rate', serviceKey: 'ghost' });
    expect(priceEntries([entry('20260710', 2)], agreement([svc({ isArchived: true })]), noVat, 'acc')).toEqual({ error: 'no-rate', serviceKey: 'training' });
  });

  it('falls back to the default account, and refuses when neither is set', () => {
    const r = priceEntries([entry('20260710', 2)], agreement([svc({ accountKey: '' })]), noVat, 'acc-default') as PricedInvoice;
    expect(r.billLines[0].accountKey).toBe('acc-default');
    expect(priceEntries([entry('20260710', 2)], agreement([svc({ accountKey: '' })]), noVat, '')).toEqual({ error: 'no-account', serviceKey: 'training' });
  });

  it('groups bill lines per service (account, cost centre, VAT code) with gross amounts', () => {
    const a = agreement([
      svc({ vatCodeKey: 'MWST-8.1' }),
      svc({ key: 'regatta', name: 'Regatta', unit: 'day', accountKey: 'acc-regatta', costCenterKey: 'cc-regatta', vatCodeKey: 'MWST-8.1', rates: [{ validFrom: '20260101', amount: chf(30000) }] }),
    ]);
    const r = priceEntries([entry('20260710', 2), entry('20260712', 1, 'regatta'), entry('20260720', 1)], a, vat81, 'acc') as PricedInvoice;
    expect(r.subtotal).toBe(45000);
    expect(r.vatAmount).toBe(3645); // 45000 × 8.1 % = 3645
    expect(r.total).toBe(48645);
    expect(r.billLines).toEqual([
      { title: 'Regatta', accountKey: 'acc-regatta', costCenterKey: 'cc-regatta', vatCodeKey: 'MWST-8.1', amount: 32430 },
      { title: 'Training', accountKey: 'acc-training', costCenterKey: 'cc-jugend', vatCodeKey: 'MWST-8.1', amount: 16215 },
    ]);
    expect(r.billLines.reduce((s, l) => s + l.amount, 0)).toBe(r.total);
  });

  it('keeps the bill lines summing to the total when VAT rounding is shared by two services', () => {
    const a = agreement([
      svc({ vatCodeKey: 'MWST-8.1', rates: [{ validFrom: '20260101', amount: chf(4730) }] }),
      svc({ key: 'regatta', name: 'Regatta', vatCodeKey: 'MWST-8.1', rates: [{ validFrom: '20260101', amount: chf(4730) }] }),
    ]);
    const r = priceEntries([entry('20260710', 1), entry('20260711', 1, 'regatta')], a, vat81, 'acc') as PricedInvoice;
    expect(r.vatAmount).toBe(765); // 9460 × 8.1 % = 766.26 → 765
    expect(r.billLines.reduce((s, l) => s + l.amount, 0)).toBe(r.total);
  });
});

describe('invoice numbers', () => {
  it('formatInvoiceNo', () => {
    expect(formatInvoiceNo('{yy}{mm}', '2026-07', 1)).toBe('2607');
    expect(formatInvoiceNo('{yyyy}-{n}', '2026-07', 12)).toBe('2026-12');
    expect(formatInvoiceNo('SCS-{yyyy}{mm}-{n}', '2026-01', 3)).toBe('SCS-202601-3');
  });

  it('templateUsesCounter', () => {
    expect(templateUsesCounter('{yy}{mm}')).toBe(false);
    expect(templateUsesCounter('{yyyy}-{n}')).toBe(true);
  });

  it('trainerInvoiceKey', () => {
    expect(trainerInvoiceKey('agr1', '2026-07')).toBe('agr1_202607');
  });

  it('lastDayOfMonth', () => {
    expect(lastDayOfMonth('2026-07')).toBe('20260731');
    expect(lastDayOfMonth('2026-02')).toBe('20260228');
    expect(lastDayOfMonth('2028-02')).toBe('20280229');
    expect(lastDayOfMonth('2026-12')).toBe('20261231');
  });
});

describe('sendRefusal', () => {
  function profile(patch: Partial<TrainerProfileModel> = {}): TrainerProfileModel {
    const p = new TrainerProfileModel('scs');
    p.okey = 'p1';
    return Object.assign(p, patch);
  }
  type Ctx = Parameters<typeof sendRefusal>[0];
  const ok = (patch: Partial<Ctx> = {}): Ctx => ({
    callerPersonKey: 'p1',
    agreement: agreement([svc()]),
    profile: profile(),
    iban: 'CH9300762011623852957',
    postalOk: true,
    month: '2026-07',
    todayMonth: '2026-11',
    existingState: undefined,
    openEntryCount: 3,
    booksTenants: ['scs'],
    callerTenantId: 'scs',
    ...patch,
  });

  it('sendRefusal covers every reason in order', () => {
    expect(sendRefusal(ok())).toBe('');
    expect(sendRefusal(ok({ existingState: 'sent' }))).toBe('already-sent'); // Review Focus 2
    expect(sendRefusal(ok({ existingState: 'booked' }))).toBe('already-sent');
    expect(sendRefusal(ok({ existingState: 'rejected' }))).toBe(''); // resend after reject
    expect(sendRefusal(ok({ iban: '' }))).toBe('no-iban'); // Review Focus 5
    expect(sendRefusal(ok({ postalOk: false }))).toBe('no-postal');
    expect(sendRefusal(ok({ month: '2026-12', todayMonth: '2026-11' }))).toBe('future-month');
    expect(sendRefusal(ok({ month: '2026-11', todayMonth: '2026-11' }))).toBe('');
    expect(sendRefusal(ok({ openEntryCount: 0 }))).toBe('no-entries');
  });

  it('refuses a caller who is not the trainer of the agreement, or a missing agreement', () => {
    expect(sendRefusal(ok({ callerPersonKey: 'p2' }))).toBe('not-owner');
    expect(sendRefusal(ok({ agreement: undefined }))).toBe('not-owner');
  });

  it('refuses when the books do not belong to the caller tenant', () => {
    expect(sendRefusal(ok({ booksTenants: ['gss'] }))).toBe('books-mismatch');
  });

  it('accepts an agreement active on the first or the last day of the month, refuses otherwise', () => {
    expect(sendRefusal(ok({ agreement: agreement([svc()], { validFrom: '20260715' }) }))).toBe('');
    expect(sendRefusal(ok({ agreement: agreement([svc()], { validTo: '20260715' }) }))).toBe('');
    expect(sendRefusal(ok({ agreement: agreement([svc()], { validFrom: '20260801' }) }))).toBe('agreement-inactive');
    expect(sendRefusal(ok({ agreement: agreement([svc()], { selfEmployedConfirmed: false }) }))).toBe('agreement-inactive');
  });

  it('refuses an incomplete profile', () => {
    expect(sendRefusal(ok({ profile: undefined }))).toBe('profile-incomplete');
    expect(sendRefusal(ok({ profile: profile({ numberTemplate: '' }) }))).toBe('profile-incomplete');
    const nameless = agreement([svc()], { person: undefined });
    expect(sendRefusal(ok({ agreement: nameless, profile: profile({ companyName: '' }) }))).toBe('profile-incomplete');
    expect(sendRefusal(ok({ agreement: nameless, profile: profile({ companyName: 'Jucker Sport' }) }))).toBe('');
  });

  it('checks in the documented order', () => {
    const all = ok({
      callerPersonKey: 'p2', booksTenants: ['gss'], profile: undefined, postalOk: false, iban: '',
      month: '2026-12', existingState: 'sent', openEntryCount: 0,
    });
    expect(sendRefusal(all)).toBe('not-owner');
    expect(sendRefusal({ ...all, callerPersonKey: 'p1' })).toBe('books-mismatch');
    expect(sendRefusal({ ...all, callerPersonKey: 'p1', booksTenants: ['scs'], agreement: agreement([svc()], { isArchived: true }) })).toBe('agreement-inactive');
    const base = { ...all, callerPersonKey: 'p1', booksTenants: ['scs'] };
    expect(sendRefusal(base)).toBe('profile-incomplete');
    expect(sendRefusal({ ...base, profile: profile() })).toBe('no-postal');
    expect(sendRefusal({ ...base, profile: profile(), postalOk: true })).toBe('no-iban');
    expect(sendRefusal({ ...base, profile: profile(), postalOk: true, iban: 'CH93' })).toBe('future-month');
    expect(sendRefusal({ ...base, profile: profile(), postalOk: true, iban: 'CH93', month: '2026-07' })).toBe('already-sent');
    expect(sendRefusal({ ...base, profile: profile(), postalOk: true, iban: 'CH93', month: '2026-07', existingState: undefined })).toBe('no-entries');
  });
});

describe('trainerInvoiceStateForBill', () => {
  it('trainerInvoiceStateForBill maps §7.6', () => {
    expect(trainerInvoiceStateForBill('draft')).toBe('sent');
    expect(trainerInvoiceStateForBill('todo')).toBe('booked');
    expect(trainerInvoiceStateForBill('overdue')).toBe('booked');
    expect(trainerInvoiceStateForBill('paid')).toBe('paid');
    expect(trainerInvoiceStateForBill('deleted')).toBeUndefined();
  });
});

describe('buildTrainerInvoicePayload', () => {
  const hours = [3, 3, 4, 4, 4, 2, 2, 2, 2, 2, 2, 2, 2];
  const days = [1, 2, 3, 4, 5, 8, 10, 11, 12, 15, 17, 18, 19];
  function july(vat = noVat, svcPatch: Partial<TrainerService> = {}): PricedInvoice {
    const entries = hours.map((h, i) => entry(`202607${String(days[i]).padStart(2, '0')}`, h, 'training', i < 2 ? 'Rotsee' : ''));
    return priceEntries(entries, agreement([svc({ name: 'Trainingsbetreuung', ...svcPatch })]), vat, 'acc') as PricedInvoice;
  }
  function profile(patch: Partial<TrainerProfileModel> = {}): TrainerProfileModel {
    const p = new TrainerProfileModel('scs');
    p.okey = 'p1';
    p.companyName = 'Muster Sport';
    p.contactName = 'Hans Muster';
    return Object.assign(p, patch);
  }
  const base = (patch: Partial<Parameters<typeof buildTrainerInvoicePayload>[0]> = {}) => ({
    invoiceNo: '2607',
    invoiceDate: '20260830',
    dueDate: '20260929',
    month: '2026-07',
    profile: profile(),
    trainerName: 'Hans Muster',
    trainerAddress: ['Seestrasse 12', '8712 Stäfa'],
    recipientName: 'Ruderclub Beispiel',
    recipientAddress: ['Kassier', 'Seeweg 1', '8000 Zürich'],
    priced: july(),
    iban: 'CH9300762011623852957',
    ...patch,
  });

  it('formats the July 2026 example in de-CH', () => {
    const p = buildTrainerInvoicePayload(base());
    expect(p['totalText']).toBe("1'700.00");
    expect(p['monthTitle']).toBe('Juli 2026');
    expect(p['invoiceDateText']).toBe('30. August 2026');
    expect(p['dueDateText']).toBe('29. September 2026');
    expect(p['invoiceNo']).toBe('2607');
    expect(p['ibanText']).toBe('CH93 0076 2011 6238 5295 7');
  });

  it('has one row per line, with date, service, quantity, rate and amount texts', () => {
    const rows = buildTrainerInvoicePayload(base())['rows'] as Record<string, string>[];
    expect(rows.length).toBe(13);
    expect(rows[0]).toEqual({ dateText: '1. Juli 2026', service: 'Trainingsbetreuung Rotsee', quantityText: '3 Std.', rateText: '50.00', amountText: '150.00' });
    expect(rows[12]).toEqual({ dateText: '19. Juli 2026', service: 'Trainingsbetreuung', quantityText: '2 Std.', rateText: '50.00', amountText: '100.00' });
  });

  it('prints fractional quantities and day units', () => {
    const r = priceEntries(
      [entry('20260710', 1.5), entry('20260711', 1, 'regatta'), entry('20260712', 0.5, 'regatta')],
      agreement([svc(), svc({ key: 'regatta', name: 'Regatta', unit: 'day', rates: [{ validFrom: '20260101', amount: chf(30000) }] })]),
      noVat,
      'acc',
    ) as PricedInvoice;
    const rows = buildTrainerInvoicePayload(base({ priced: r }))['rows'] as Record<string, string>[];
    expect(rows.map((x) => x.quantityText)).toEqual(['1.5 Std.', '1 Tag', '0.5 Tage']);
    expect(rows[1].rateText).toBe('300.00');
  });

  it('prints the VAT note and no VAT line when the trainer is not VAT-registered', () => {
    const p = buildTrainerInvoicePayload(base({ profile: profile({ vatNote: 'Rechnungsbetrag netto. Nicht mehrwertsteuerpflichtig.' }) }));
    expect(p['vatLine']).toBeUndefined();
    expect(p['vatNote']).toBe('Rechnungsbetrag netto. Nicht mehrwertsteuerpflichtig.');
  });

  it('falls back to a default VAT note when the profile has none', () => {
    const p = buildTrainerInvoicePayload(base({ profile: profile({ vatNote: '' }) }));
    expect(p['vatLine']).toBeUndefined();
    expect(p['vatNote']).toBeTruthy();
  });

  it('prints subtotal and the VAT line, not the note, when the trainer is VAT-registered', () => {
    const priced = july(vat81, { vatCodeKey: 'MWST-8.1' });
    const p = buildTrainerInvoicePayload(base({
      priced,
      profile: profile({ vatRegistered: true, vatNumber: 'CHE-123.456.789 MWST', vatNote: 'ignored' }),
      vatRatePercent: 8.1,
    }));
    expect(p['vatNote']).toBeUndefined();
    expect(p['subtotalText']).toBe("1'700.00");
    expect(p['vatLine']).toEqual({ label: 'MWST 8.1 %', amountText: '137.70', vatNumber: 'CHE-123.456.789 MWST' });
    expect(p['totalText']).toBe("1'837.70");
  });

  it('uses the company name as sender, else the trainer name; contact name as our reference', () => {
    expect(buildTrainerInvoicePayload(base())).toMatchObject({ senderName: 'Muster Sport', ourRef: 'Hans Muster' });
    expect(buildTrainerInvoicePayload(base({ profile: profile({ companyName: '', contactName: '' }) })))
      .toMatchObject({ senderName: 'Hans Muster', ourRef: 'Hans Muster' });
  });

  it('carries sender, recipient, closing text, logo and the QR slip fields', () => {
    const p = buildTrainerInvoicePayload(base({ logoUrl: 'https://example.imgix.net/logo.png?fm=png', bankName: 'Testbank' }));
    expect(p).toMatchObject({
      senderAddress: ['Seestrasse 12', '8712 Stäfa'],
      recipientName: 'Ruderclub Beispiel',
      recipientAddress: ['Kassier', 'Seeweg 1', '8000 Zürich'],
      closingText: 'Herzlichen Dank für deinen Auftrag.',
      logoUrl: 'https://example.imgix.net/logo.png?fm=png',
      bankName: 'Testbank',
      amount: '1700.00',
      qrMessage: 'Rechnung 2607',
    });
    expect(buildTrainerInvoicePayload(base())['logoUrl']).toBe('');
  });

  it('never carries the profile logo storage path as the logo URL', () => {
    const p = buildTrainerInvoicePayload(base({ profile: profile({ logoUrl: 'trainer/p1/logo.svg' }) }));
    expect(p['logoUrl']).toBe('');
  });
});

import { HttpsError } from 'firebase-functions/v2/https';
import { describe, expect, it } from 'vitest';

import { TrainerAgreementModel, TrainerProfileModel, WorkEntryModel } from '@okr/shared-models';

import { mayReadTrainerInvoice } from './download-trainer-invoice';
import { candidateInvoiceNo, invoiceFilename, planFingerprint, planSend, SendPlan } from './send-trainer-invoice';
import { InvoiceContext, isMonth, renderRefusal, trainerLogoUrl } from './trainer-invoice-context';

const IBAN = 'CH9300762011623852957';

function agreement(patch: Partial<TrainerAgreementModel> = {}): TrainerAgreementModel {
  return Object.assign(new TrainerAgreementModel('scs'), {
    okey: 'a1', accountingTenantId: 'scs', personKey: 'p1',
    person: { key: 'p1', name1: 'Hans', name2: 'Muster', modelType: 'person', type: '', subType: '', label: '' },
    validFrom: '20260101', validTo: '', selfEmployedConfirmed: true,
    services: [
      { key: 'training', name: 'Training', unit: 'hour', rates: [{ validFrom: '20260101', amount: { amount: 5000, currency: 'CHF', periodicity: 'one-time' } }], accountKey: 'acc1', costCenterKey: '', vatCodeKey: '', isArchived: false },
      { key: 'regatta', name: 'Regatta', unit: 'day', rates: [{ validFrom: '20260101', amount: { amount: 30000, currency: 'CHF', periodicity: 'one-time' } }], accountKey: '', costCenterKey: '', vatCodeKey: '', isArchived: false },
    ],
    ...patch,
  });
}

function profile(patch: Partial<TrainerProfileModel> = {}): TrainerProfileModel {
  return Object.assign(new TrainerProfileModel('scs'), { okey: 'p1', companyName: 'Muster Sport', numberTemplate: '{yy}{mm}', nextNumber: 7, ...patch });
}

function entry(okey: string, patch: Partial<WorkEntryModel> = {}): WorkEntryModel {
  return Object.assign(new WorkEntryModel('scs'), {
    okey, accountingTenantId: 'scs', personKey: 'p1', agreementKey: 'a1', date: '20260710', serviceKey: 'training', quantity: 2, state: 'open', ...patch,
  });
}

function ctx(patch: Partial<InvoiceContext> = {}): InvoiceContext {
  return {
    uid: 'u1', tenantId: 'scs', callerPersonKey: 'p1', agreementKey: 'a1', month: '2026-07', today: '20260830',
    agreement: agreement(), profile: profile(), entries: [entry('e1'), entry('e2', { date: '20260702', quantity: 1.5 })],
    booksTenants: ['scs'], nativeBooks: true, defaultAccountKey: 'acc-default', vatRatePercentByCode: {},
    payee: { name: 'Muster Sport', iban: IBAN, qrIban: '', regularIban: IBAN, street: 'Seestrasse', buildingNumber: '1', zip: '8712', city: 'Stäfa', country: 'CH' },
    postalOk: true, trainerName: 'Hans Muster', recipientName: 'Seeclub', recipientAddress: [], logoUrl: '', treasurer: null,
    ...patch,
  };
}

function plan(result: ReturnType<typeof planSend>): SendPlan {
  if ('refusal' in result) throw new Error(`refused: ${result.refusal}`);
  return result;
}

describe('planSend', () => {
  it('plans a first send: number from the template, open entries priced, a draft bill on native books', () => {
    const p = plan(planSend(ctx(), undefined, false));
    expect(p.invoiceKey).toBe('a1_202607');
    expect(p.invoiceNo).toBe('2607');
    expect(p.nextNumber).toBe(7);
    expect(p.invoiceDate).toBe('20260830');
    expect(p.dueDate).toBe('20260929');
    expect(p.priced.total).toBe(17500);
    expect(p.billKey).toBe('ti-a1_202607');
    expect(p.billLines).toEqual([{ title: 'Training', accountKey: 'acc1', amount: 17500, vatCodeKey: '', costCenterKey: '', projectKey: '' }]);
  });

  it('refuses a second send of a sent month (already-sent)', () => {
    expect(planSend(ctx(), { state: 'sent', invoiceNo: '2607' }, false)).toEqual({ refusal: 'already-sent' });
    expect(planSend(ctx(), { state: 'booked', invoiceNo: '2607' }, false)).toEqual({ refusal: 'already-sent' });
  });

  it('keeps the number of a rejected invoice when the template has no {n}', () => {
    const p = plan(planSend(ctx(), { state: 'rejected', invoiceNo: 'R-2607' }, false));
    expect(p.invoiceNo).toBe('R-2607');
    expect(p.nextNumber).toBe(7);
  });

  it('takes nextNumber with {n} and moves the counter on — also when resending a rejected invoice', () => {
    const c = ctx({ profile: profile({ numberTemplate: '{yyyy}-{n}' }) });
    const first = plan(planSend(c, undefined, false));
    expect(first.invoiceNo).toBe('2026-7');
    expect(first.nextNumber).toBe(8);
    const resend = plan(planSend(c, { state: 'rejected', invoiceNo: '2026-3' }, false));
    expect(resend.invoiceNo).toBe('2026-7');
    expect(resend.nextNumber).toBe(8);
  });

  it('refuses a number another invoice of the trainer already has (duplicate-number)', () => {
    expect(planSend(ctx(), undefined, true)).toEqual({ refusal: 'duplicate-number' });
  });

  it('plans no bill on bexio books', () => {
    const p = plan(planSend(ctx({ nativeBooks: false }), undefined, false));
    expect(p.billKey).toBe('');
    expect(p.priced.total).toBe(17500);
  });

  it('lists exactly the open, live entries of this agreement, person and month', () => {
    const entries = [
      entry('e1'),
      entry('e-first', { date: '20260701' }),
      entry('e-last', { date: '20260731' }),
      entry('e-june', { date: '20260630' }),
      entry('e-august', { date: '20260801' }),
      entry('e-invoiced', { state: 'invoiced', invoiceKey: 'x' }),
      entry('e-archived', { isArchived: true }),
      entry('e-other-agreement', { agreementKey: 'a2' }),
      entry('e-other-person', { personKey: 'p2' }),
    ];
    const p = plan(planSend(ctx({ entries }), undefined, false));
    expect(p.entryKeys).toEqual(['e1', 'e-first', 'e-last']);
    expect(p.priced.lines.map((l) => l.workEntryKey).sort()).toEqual(['e-first', 'e-last', 'e1']);
  });

  it('refuses no-entries when nothing open is left in the month', () => {
    expect(planSend(ctx({ entries: [entry('e1', { state: 'invoiced' })] }), undefined, false)).toEqual({ refusal: 'no-entries' });
  });

  it.each([
    ['zero', 0], ['negative', -1], ['NaN', Number.NaN], ['infinite', Number.POSITIVE_INFINITY], ['a string', '2' as unknown as number], ['over 24 hours', 24.25],
  ])('refuses an entry with %s hours (invalid-entry)', (_label, quantity) => {
    expect(planSend(ctx({ entries: [entry('e1'), entry('bad', { quantity })] }), undefined, false)).toEqual({ refusal: 'invalid-entry', entryKey: 'bad' });
  });

  it('refuses an entry whose quantity rounds to 0 (0.1 h, 0.2 days): no CHF 0 line', () => {
    expect(planSend(ctx({ entries: [entry('e1'), entry('tiny', { quantity: 0.1 })] }), undefined, false)).toEqual({ refusal: 'invalid-entry', entryKey: 'tiny' });
    expect(planSend(ctx({ entries: [entry('d', { serviceKey: 'regatta', quantity: 0.2 })] }), undefined, false)).toEqual({ refusal: 'invalid-entry', entryKey: 'd' });
    expect(plan(planSend(ctx({ entries: [entry('q', { quantity: 0.2 })] }), undefined, false)).priced.lines[0].quantity).toBe(0.25);
  });

  it('refuses more than one day per day entry', () => {
    const entries = [entry('d1', { serviceKey: 'regatta', quantity: 1.5 })];
    expect(planSend(ctx({ entries }), undefined, false)).toEqual({ refusal: 'invalid-entry', entryKey: 'd1' });
    expect(plan(planSend(ctx({ entries: [entry('d2', { serviceKey: 'regatta', quantity: 1 })] }), undefined, false)).priced.total).toBe(30000);
  });

  it('surfaces a service without account and without book default (no-account)', () => {
    const entries = [entry('d1', { serviceKey: 'regatta', quantity: 1 })];
    expect(planSend(ctx({ entries, defaultAccountKey: '' }), undefined, false)).toEqual({ refusal: 'no-account', serviceKey: 'regatta' });
  });

  it('surfaces a missing VAT code of a VAT-registered trainer (no-vat-code)', () => {
    expect(planSend(ctx({ profile: profile({ vatRegistered: true }) }), undefined, false)).toEqual({ refusal: 'no-vat-code', serviceKey: 'training' });
  });

  it('refuses the agreement of another person and books of another tenant', () => {
    expect(planSend(ctx({ agreement: undefined }), undefined, false)).toEqual({ refusal: 'not-owner' });
    expect(planSend(ctx({ callerPersonKey: 'p2' }), undefined, false)).toEqual({ refusal: 'not-owner' });
    expect(planSend(ctx({ booksTenants: ['other'] }), undefined, false)).toEqual({ refusal: 'books-mismatch' });
  });

  it('refuses a month in the future and an incomplete payee', () => {
    expect(planSend(ctx({ today: '20260615' }), undefined, false)).toEqual({ refusal: 'future-month' });
    expect(planSend(ctx({ today: '20260731' }), undefined, false)).toEqual({ refusal: 'month-not-over' }); // Ruling R9
    // the preview may show the running month, but not a future one
    expect(plan(planSend(ctx({ today: '20260731' }), undefined, false, true)).invoiceDate).toBe('20260731');
    expect(planSend(ctx({ today: '20260615' }), undefined, false, true)).toEqual({ refusal: 'future-month' });
    expect(plan(planSend(ctx({ today: '20260801' }), undefined, false)).invoiceDate).toBe('20260801');
    expect(planSend(ctx({ postalOk: false }), undefined, false)).toEqual({ refusal: 'no-postal' });
    expect(planSend(ctx({ payee: { ...ctx().payee, iban: '' } }), undefined, false)).toEqual({ refusal: 'no-iban' });
  });

  it('refuses a bank account that is a QR-IBAN only (qr-iban-only): no QR reference on a trainer invoice', () => {
    const QR_IBAN = 'CH4431999123000889012';
    expect(planSend(ctx({ payee: { ...ctx().payee, iban: QR_IBAN, qrIban: QR_IBAN, regularIban: '' } }), undefined, false)).toEqual({ refusal: 'qr-iban-only' });
  });

  it('clamps an absurd payment term to the default', () => {
    expect(plan(planSend(ctx({ profile: profile({ paymentTermDays: -5 }) }), undefined, false)).dueDate).toBe('20260929');
    expect(plan(planSend(ctx({ profile: profile({ paymentTermDays: 10 }) }), undefined, false)).dueDate).toBe('20260909');
  });
});

describe('candidateInvoiceNo', () => {
  it('is the number planSend gives', () => {
    expect(candidateInvoiceNo(profile(), '2026-07', undefined)).toBe('2607');
    expect(candidateInvoiceNo(profile(), '2026-07', { state: 'rejected', invoiceNo: 'R-1' })).toBe('R-1');
    expect(candidateInvoiceNo(profile({ numberTemplate: '{n}' }), '2026-07', { state: 'rejected', invoiceNo: 'R-1' })).toBe('7');
    expect(candidateInvoiceNo(profile({ nextNumber: 'x' as unknown as number, numberTemplate: '{n}' }), '2026-07', undefined)).toBe('1');
  });
});

describe('planFingerprint', () => {
  it('changes when an entry, its quantity or the number changes (concurrent-send)', () => {
    const base = planFingerprint(plan(planSend(ctx(), undefined, false)));
    expect(planFingerprint(plan(planSend(ctx(), undefined, false)))).toBe(base);
    expect(planFingerprint(plan(planSend(ctx({ entries: [entry('e1')] }), undefined, false)))).not.toBe(base);
    expect(planFingerprint(plan(planSend(ctx({ entries: [entry('e1', { quantity: 3 }), entry('e2', { date: '20260702', quantity: 1.5 })] }), undefined, false)))).not.toBe(base);
    expect(planFingerprint(plan(planSend(ctx({ profile: profile({ nextNumber: 8, numberTemplate: '{n}' }) }), undefined, false))))
      .not.toBe(planFingerprint(plan(planSend(ctx({ profile: profile({ nextNumber: 7, numberTemplate: '{n}' }) }), undefined, false))));
  });
});

describe('renderRefusal', () => {
  it('maps the slip refusals of renderDocument to readable send reasons', () => {
    expect(renderRefusal(new HttpsError('failed-precondition', 'x', { reason: 'qr-iban-needs-reference' }))).toBe('qr-iban-only');
    expect(renderRefusal(new HttpsError('failed-precondition', 'x', { reason: 'no-payee-iban' }))).toBe('no-iban');
    expect(renderRefusal(new HttpsError('internal', 'x'))).toBe('');
    expect(renderRefusal(new Error('x'))).toBe('');
  });
});

describe('trainerLogoUrl', () => {
  it('prints only a logo under the trainer\'s own upload prefix, as imgix PNG', () => {
    expect(trainerLogoUrl('tenant/scs/person/p1/logo/firma logo.svg', 'scs', 'p1'))
      .toBe('https://bkaiser.imgix.net/tenant/scs/person/p1/logo/firma%20logo.svg?fm=png&w=600');
    expect(trainerLogoUrl('tenant/scs/person/p2/logo/x.png', 'scs', 'p1')).toBe('');
    expect(trainerLogoUrl('tenant/scs/person/p1/../../p2/x.png', 'scs', 'p1')).toBe('');
    expect(trainerLogoUrl('tenant/other/person/p1/x.png', 'scs', 'p1')).toBe('');
    expect(trainerLogoUrl('tenant/scs/person/p1/', 'scs', 'p1')).toBe('');
    expect(trainerLogoUrl(42, 'scs', 'p1')).toBe('');
  });
});

describe('isMonth', () => {
  it('accepts YYYY-MM only', () => {
    expect(isMonth('2026-07')).toBe(true);
    expect(isMonth('2026-13')).toBe(false);
    expect(isMonth('2026-7')).toBe(false);
    expect(isMonth(202607)).toBe(false);
  });
});

describe('mayReadTrainerInvoice', () => {
  const invoice = { tenants: ['scs'], personKey: 'p1' };
  it('lets the trainer and treasurer/admin/privileged of the tenant read, nobody else', () => {
    expect(mayReadTrainerInvoice({ tenantId: 'scs', personKey: 'p1', roles: {} }, invoice)).toBe(true);
    expect(mayReadTrainerInvoice({ tenantId: 'scs', personKey: 'p2', roles: { treasurer: true } }, invoice)).toBe(true);
    expect(mayReadTrainerInvoice({ tenantId: 'scs', personKey: 'p2', roles: { admin: true } }, invoice)).toBe(true);
    expect(mayReadTrainerInvoice({ tenantId: 'scs', personKey: 'p2', roles: { privileged: true } }, invoice)).toBe(true);
    expect(mayReadTrainerInvoice({ tenantId: 'scs', personKey: 'p2', roles: { memberAdmin: true } }, invoice)).toBe(false);
    expect(mayReadTrainerInvoice({ tenantId: 'other', personKey: 'p1', roles: { treasurer: true } }, invoice)).toBe(false);
    expect(mayReadTrainerInvoice({ tenantId: 'scs', personKey: '', roles: {} }, { tenants: ['scs'], personKey: '' })).toBe(false);
  });
});

describe('invoiceFilename', () => {
  it('turns a free-text number into a safe file name', () => {
    expect(invoiceFilename('2607')).toBe('Rechnung-2607.pdf');
    expect(invoiceFilename('JS/26 07')).toBe('Rechnung-JS-26-07.pdf');
    expect(invoiceFilename('')).toBe('Rechnung-Trainer.pdf');
  });
});

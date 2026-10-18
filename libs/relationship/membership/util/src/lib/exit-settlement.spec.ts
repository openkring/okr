import { describe, expect, it } from 'vitest';
import type { FeeScheduleEntry } from '@okr/shared-models';
import {
  computeExitSettlement, exitSettlementTaskName, exitSettlementTaskNotes, invoiceShape, pickFeeInvoice,
  type ExitSettlementInput, type InvoiceFacts,
} from './exit-settlement';

const schedule: FeeScheduleEntry = {
  year: 2026,
  positions: [{ key: 'fee', usage: 'membershipFee', type: 'fee', label: 'Jahresbeitrag', source: 'category', proRata: true }],
};

const bexioPaid675: InvoiceFacts = {
  okey: 'inv1', invoiceId: 'REA-01911', accountingTenantId: 'scs', state: 'paid', invoiceNo: 0, bookingKey: '',
  invoiceDate: '20260416', title: 'Jahresbeitrag 2026', totalRappen: 67500, paidRappen: 67500, positions: [],
};
const nativeInv = (over: Partial<InvoiceFacts> = {}): InvoiceFacts => ({
  ...bexioPaid675, okey: 'inv2', invoiceId: 'R-1', invoiceNo: 7, bookingKey: 'b1',
  positions: [{ usage: 'membershipFee', year: 2026, amount: 350 }], totalRappen: 35000, paidRappen: 35000, ...over,
});

interface Over extends Partial<ExitSettlementInput> { entry?: string; exit?: string; category?: string }
const input = (o: Over = {}): ExitSettlementInput => ({
  membership: { dateOfEntry: o.entry ?? '20250205', dateOfExit: o.exit ?? '20261031', category: o.category ?? 'active', orgKey: 'scs' },
  overlappingMemberships: 1,
  schedule,
  categoryLists: { scs: { active: 600, youth: 300 } },
  defaultCategoryList: 'scs',
  booksId: 'scs',
  invoices: [bexioPaid675],
  today: '20261018',
  ...o,
});

describe('computeExitSettlement', () => {
  it('paid bexio invoice, exit 31.10. -> refund CHF 100', () => {
    const s = computeExitSettlement(input());
    expect(s).toMatchObject({ case: 'paid', months: 10, yearlyFr: 600, dueFr: 500, billedFr: 600,
      overpaidRappen: 10000, refundRappen: 10000, choices: ['refund', 'extend'], shape: 'bexio' });
  });
  it('youth price 300, exit 30.06. -> due 150, refund 15000', () => {
    const s = computeExitSettlement(input({ category: 'youth', exit: '20260630' }));
    expect(s).toMatchObject({ case: 'paid', dueFr: 150, overpaidRappen: 15000, refundRappen: 15000 });
  });
  it('exit 31.12. -> none', () => expect(computeExitSettlement(input({ exit: '20261231' })).case).toBe('none'));
  it('exit empty -> none', () => expect(computeExitSettlement(input({ exit: '' })).case).toBe('none'));
  it('exit 99991231 -> none', () => expect(computeExitSettlement(input({ exit: '99991231' })).case).toBe('none'));
  it('exit in 2024 with today 2026 -> none', () => expect(computeExitSettlement(input({ exit: '20240630' })).case).toBe('none'));
  it('exit in the previous year is still handled', () => {
    expect(computeExitSettlement(input({ entry: '20240101', exit: '20250630', today: '20260110', invoices: [{ ...bexioPaid675, invoiceDate: '20250416' }], schedule: { ...schedule, year: 2025 } })).case).toBe('paid');
  });
  it('no schedule -> none', () => expect(computeExitSettlement(input({ schedule: undefined })).case).toBe('none'));
  it('no proRata rule -> none', () => {
    const sch = { year: 2026, positions: [{ ...schedule.positions[0], proRata: false }] };
    expect(computeExitSettlement(input({ schedule: sch })).case).toBe('none');
  });
  it('manual source uses rule.amount', () => {
    const sch = { year: 2026, positions: [{ ...schedule.positions[0], source: 'manual' as const, amount: 600 }] };
    expect(computeExitSettlement(input({ schedule: sch }))).toMatchObject({ case: 'paid', yearlyFr: 600 });
  });
  it('category without price -> manual no-price', () => {
    expect(computeExitSettlement(input({ category: 'ghost' }))).toMatchObject({ case: 'manual', manualReason: 'no-price', choices: ['extend'] });
  });
  it('two memberships overlapping the year -> manual category-change', () => {
    expect(computeExitSettlement(input({ overlappingMemberships: 2 }))).toMatchObject({ case: 'manual', manualReason: 'category-change' });
  });
  it('no invoice -> manual no-invoice', () => {
    expect(computeExitSettlement(input({ invoices: [] }))).toMatchObject({ case: 'manual', manualReason: 'no-invoice', choices: ['extend'] });
  });
  it('two matching invoices -> manual ambiguous-invoice', () => {
    expect(computeExitSettlement(input({ invoices: [bexioPaid675, { ...bexioPaid675, okey: 'x' }] }))).toMatchObject({ case: 'manual', manualReason: 'ambiguous-invoice' });
  });
  it('invoice in other books -> manual books-mismatch', () => {
    expect(computeExitSettlement(input({ invoices: [{ ...bexioPaid675, accountingTenantId: 'gss' }] }))).toMatchObject({ case: 'manual', manualReason: 'books-mismatch' });
  });
  it('bexio + entry 20260601 + exit 20261031 -> manual bexio-entry-year', () => {
    expect(computeExitSettlement(input({ entry: '20260601' }))).toMatchObject({ case: 'manual', manualReason: 'bexio-entry-year' });
  });
  it('native + entry 20260601 + exit 20261031: billed 350, due 250 -> overpaid 10000', () => {
    const s = computeExitSettlement(input({ entry: '20260601', invoices: [nativeInv()] }));
    expect(s).toMatchObject({ case: 'paid', months: 5, billedFr: 350, dueFr: 250, overpaidRappen: 10000, shape: 'native' });
  });
  it('billed not above due -> none', () => {
    expect(computeExitSettlement(input({ entry: '20260601', invoices: [nativeInv({ positions: [{ usage: 'membershipFee', year: 2026, amount: 250 }] })] })).case).toBe('none');
  });
  it('unpaid native -> unpaid, adjust-invoice + extend', () => {
    const s = computeExitSettlement(input({ invoices: [nativeInv({ positions: [{ usage: 'membershipFee', year: 2026, amount: 600 }], totalRappen: 60000, paidRappen: 0 })] }));
    expect(s).toMatchObject({ case: 'unpaid', choices: ['adjust-invoice', 'extend'], refundRappen: 0 });
  });
  it('unpaid bexio -> unpaid, extend only', () => {
    expect(computeExitSettlement(input({ invoices: [{ ...bexioPaid675, paidRappen: 0 }] }))).toMatchObject({ case: 'unpaid', choices: ['extend'] });
  });
  it('partial 400.00 of 675.00, overpaid 100 -> partial-short', () => {
    expect(computeExitSettlement(input({ invoices: [{ ...bexioPaid675, paidRappen: 40000 }] }))).toMatchObject({ case: 'partial-short', choices: ['extend'], refundRappen: 0 });
  });
  it('partial 600.00 of 675.00, overpaid 100 -> partial-enough, refund 2500', () => {
    expect(computeExitSettlement(input({ invoices: [{ ...bexioPaid675, paidRappen: 60000 }] }))).toMatchObject({ case: 'partial-enough', refundRappen: 2500, choices: ['refund', 'extend'] });
  });
  it('bexio invoice total below assumed yearly -> manual billed-exceeds-invoice', () => {
    for (const o of [{ exit: '20260131', invoices: [{ ...bexioPaid675, totalRappen: 30000, paidRappen: 30000 }] },
      { exit: '20260131', invoices: [{ ...bexioPaid675, totalRappen: 30000, paidRappen: 10000 }] }]) {
      expect(computeExitSettlement(input(o))).toMatchObject({ case: 'manual', manualReason: 'billed-exceeds-invoice', refundRappen: 0, choices: ['extend'] });
    }
  });
  it('flag source on the pro-rata rule -> manual no-price', () => {
    const sch = { year: 2026, positions: [{ ...schedule.positions[0], source: 'flag' as const }] };
    expect(computeExitSettlement(input({ schedule: sch }))).toMatchObject({ case: 'manual', manualReason: 'no-price' });
  });
  it('refund never exceeds what was paid', () => {
    const s = computeExitSettlement(input());
    expect(s.refundRappen).toBeLessThanOrEqual(s.invoice?.paidRappen ?? 0);
  });
  it('manual cases always offer extend', () => {
    for (const o of [{ invoices: [] }, { overlappingMemberships: 2 }, { category: 'ghost' }, { entry: '20260601' }]) {
      expect(computeExitSettlement(input(o)).choices).toEqual(['extend']);
    }
  });
});

describe('invoiceShape', () => {
  it('bexio iff invoiceNo 0 and no bookingKey', () => {
    expect(invoiceShape(bexioPaid675)).toBe('bexio');
    expect(invoiceShape(nativeInv())).toBe('native');
  });
});

describe('pickFeeInvoice', () => {
  it('native by position year + usage', () => {
    expect(pickFeeInvoice([nativeInv()], 2026, 'membershipFee').invoice?.okey).toBe('inv2');
    expect(pickFeeInvoice([nativeInv()], 2026, 'other').invoice).toBeUndefined();
  });
  it('bexio by date + title', () => {
    expect(pickFeeInvoice([bexioPaid675], 2026, 'membershipFee').invoice?.okey).toBe('inv1');
    expect(pickFeeInvoice([{ ...bexioPaid675, title: 'Spende' }], 2026, 'membershipFee').invoice).toBeUndefined();
  });
  it('ignores a 2025 invoice', () => {
    const old = { ...bexioPaid675, invoiceDate: '20250416', title: 'Jahresbeitrag 2025' };
    expect(pickFeeInvoice([old, bexioPaid675], 2026, 'membershipFee')).toMatchObject({ ambiguous: false, invoice: { okey: 'inv1' } });
  });
  it('flags ambiguity', () => {
    expect(pickFeeInvoice([bexioPaid675, { ...bexioPaid675, okey: 'y' }], 2026, 'membershipFee')).toMatchObject({ ambiguous: true });
  });
});

describe('task text', () => {
  it('name for a refund', () => {
    expect(exitSettlementTaskName('Silvan Kamber', computeExitSettlement(input()))).toBe('Austritt pro rata: Silvan Kamber (Rückerstattung CHF 100.00)');
  });
  it('notes list the figures and the bexio assumption', () => {
    const n = exitSettlementTaskNotes(computeExitSettlement(input()), '31.10.2026');
    for (const part of ['31.10.2026', '10 von 12', 'CHF 600.00', 'CHF 500.00', 'Annahme: voller Jahresbeitrag verrechnet', 'REA-01911', 'CHF 675.00', 'CHF 100.00']) {
      expect(n).toContain(part);
    }
  });
  it('manual notes omit Verrechnet/Differenz but keep the invoice line', () => {
    const n = exitSettlementTaskNotes(computeExitSettlement(input({ entry: '20260601' })), '31.10.2026');
    expect(n).not.toContain('Verrechnet'); expect(n).not.toContain('Differenz'); expect(n).toContain('REA-01911');
  });
  it('partial-short and bexio-unpaid notes carry a hint', () => {
    expect(exitSettlementTaskNotes(computeExitSettlement(input({ invoices: [{ ...bexioPaid675, paidRappen: 40000 }] })), 'x')).toContain('von Hand abrechnen');
    expect(exitSettlementTaskNotes(computeExitSettlement(input({ invoices: [{ ...bexioPaid675, paidRappen: 0 }] })), 'x')).toContain('in Bexio storniert');
  });
  it('manual notes carry a reason line', () => {
    const n = exitSettlementTaskNotes(computeExitSettlement(input({ invoices: [] })), '31.10.2026');
    expect(n).toContain('Keine Beitragsrechnung');
  });
});

import { describe, expect, it } from 'vitest';
import { bookedBillKeys, BooksConfig, buildDigests, capNotes, dayWindow, digestRelatedKey, displayDate, DigestBill, formatChf, formatIban,
  NO_PAYMENT_ACCOUNT, selectDigestBills, toDigestBill, vendorNameOf } from './bill-approver.logic';

const bill = (o: Partial<DigestBill>): DigestBill => {
  const okey = o.okey ?? 'b1';
  return { okey, accountingTenantId: 'bka', vendorName: 'Swisscom', billId: '00991', amount: 8950, dueDate: '20261025',
    state: 'todo', bookingKeys: [`bill-${okey}`], tenants: ['bka'], paymentAccountKey: 'zkb', ...o };
};
const books = (o: Partial<BooksConfig> = {}): BooksConfig => ({
  accountingTenantId: 'bka', enabled: true, paymentAccountKeys: ['zkb', 'pf'],
  accounts: [{ key: 'zkb', name: 'ZKB Betriebskonto', iban: 'CH9300700110001234567' }, { key: 'pf', name: 'PostFinance', iban: '' }], ...o });

describe('dayWindow / keys / formatting', () => {
  it('spans the whole Zurich day', () => expect(dayWindow('20261010')).toEqual({ from: '20261010000000', to: '20261010235959' }));
  it('names the digest per books and day', () => expect(digestRelatedKey('bka', '20261010')).toBe('billDigest.bka_20261010'));
  it('formats amounts Swiss style', () => expect(formatChf(128950)).toMatch(/^1.289\.50$/));
  it('formats a StoreDate', () => expect(displayDate('20261031')).toBe('31.10.2026'));
  it('groups an IBAN by four', () => expect(formatIban('CH9300700110001234567')).toBe('CH93 0070 0110 0012 3456 7'));
});

describe('bookedBillKeys', () => {
  it('keeps only billBooked entries on bills, per tenant, without duplicates', () => {
    const m = bookedBillKeys([
      { parentKey: 'bill.b1', tags: 'system,billBooked', tenants: ['bka'] },
      { parentKey: 'bill.b1', tags: 'system,billBooked', tenants: ['bka'] },
      { parentKey: 'bill.b2', tags: 'system,payment', tenants: ['bka'] },
      { parentKey: 'invoice.i1', tags: 'system,billBooked', tenants: ['bka'] },
      { parentKey: 'bill.b3', tags: 'system,billBooked', tenants: ['scs'] },
    ]);
    expect(m.get('bka')).toEqual(['b1']);
    expect(m.get('scs')).toEqual(['b3']);
  });
});

describe('selectDigestBills', () => {
  it('drops a bill whose booking was deleted the same day', () =>
    expect(selectDigestBills([bill({}), bill({ okey: 'b2', state: 'draft', bookingKeys: [] })]).map(b => b.okey)).toEqual(['b1']));
});

describe('buildDigests', () => {
  it('skips books with the setting off and books without a config', () => {
    expect(buildDigests('20261010', [bill({})], [books({ enabled: false })])).toEqual([]);
    expect(buildDigests('20261010', [bill({ accountingTenantId: 'gss' })], [books()])).toEqual([]);
  });
  it('groups by paying account in configured order, unknown/removed accounts last', () => {
    const [d] = buildDigests('20261010', [
      bill({ okey: 'n1', paymentAccountKey: '' }), bill({ okey: 'p1', paymentAccountKey: 'pf' }),
      bill({ okey: 'z1' }), bill({ okey: 'x1', paymentAccountKey: 'removed' }),
    ], [books()]);
    expect(d.groups.map(g => g.bills.map(b => b.okey))).toEqual([['z1'], ['p1'], ['n1', 'x1']]);
    expect(d.groups[0].heading).toContain('ZKB Betriebskonto · CH93 0070 0110 0012 3456 7');
    expect(d.groups[1].heading).toMatch(/^PostFinance — 1 Kreditor, /);
    expect(d.groups[2].heading).toMatch(new RegExp(`^${NO_PAYMENT_ACCOUNT}`));
  });
  it('interleaves heading rows and bill links, and counts and sums', () => {
    const [d] = buildDigests('20261010', [bill({}), bill({ okey: 'b2', amount: 120000, dueDate: '20261031' })], [books()]);
    expect(d.count).toBe(2);
    expect(d.total).toBe(128950);
    expect(d.links.map(l => l.key)).toEqual(['heading.0', 'bill.b1', 'bill.b2']);
    expect(d.links[2].label).toBe(`Swisscom · ${formatChf(120000)} CHF · fällig 31.10.2026`);
    expect(d.lines.split('\n')).toHaveLength(3);
  });
  it('returns nothing for a day without bills', () => expect(buildDigests('20261010', [], [books()])).toEqual([]));
});

describe('toDigestBill', () => {
  it('maps a legacy doc without fields to defaults', () => expect(toDigestBill('b7', {})).toEqual({
    okey: 'b7', accountingTenantId: '', vendorName: '', billId: '', amount: 0, dueDate: '', state: '',
    bookingKeys: [], tenants: [], paymentAccountKey: '' }));
  it('maps a full doc', () => expect(toDigestBill('b1', { accountingTenantId: 'bka', vendor: { name1: 'Swisscom', name2: 'AG' },
    billId: '9', totalAmount: { amount: 8950, currency: 'CHF' }, dueDate: '20261025', state: 'todo', bookingKeys: ['bill-b1'],
    tenants: ['bka'], paymentAccountKey: 'zkb' })).toEqual({ okey: 'b1', accountingTenantId: 'bka', vendorName: 'Swisscom AG',
    billId: '9', amount: 8950, dueDate: '20261025', state: 'todo', bookingKeys: ['bill-b1'], tenants: ['bka'], paymentAccountKey: 'zkb' }));
  it('falls back to the title when the vendor has no name', () => expect(vendorNameOf({ vendor: { name1: '' }, title: 'Strom' })).toBe('Strom'));
  it('ignores a non-numeric amount', () => expect(toDigestBill('b1', { totalAmount: { amount: 'x' } }).amount).toBe(0));
});

describe('capNotes', () => {
  it('keeps text within the cap', () => expect(capNotes('abc', 3)).toBe('abc'));
  it('cuts longer text to max - 1 plus an ellipsis', () => {
    const out = capNotes('abcdef', 4);
    expect(out).toBe('abc…');
    expect(out.length).toBe(4);
  });
  it('returns nothing for a non-positive cap', () => expect(capNotes('abc', 0)).toBe(''));
});

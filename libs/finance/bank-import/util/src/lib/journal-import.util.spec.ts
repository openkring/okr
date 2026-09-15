import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { AccountModel } from '@okr/shared-models';

import { parseBexioJournal } from './bexio-journal.adapter';
import { journalAccountMapValidations } from './journal-account-map.validations';
import { compareJournalSums, importableJournalRows, journalAccountSums, normalizeAccountNo, resolveJournalAccounts, toJournalEntries } from './journal-import.util';

const journal = parseBexioJournal(readFileSync(join(__dirname, 'fixtures/bexio-journal-sample.csv'), 'utf8'));

function account(okey: string, id: string, name: string, type = 'leaf', parentKey = 'root'): AccountModel {
  const a = new AccountModel('bka');
  a.okey = okey; a.id = id; a.name = name; a.type = type; a.parentKey = parentKey;
  return a;
}
const chart = [
  account('root', '', 'bexio', 'root', ''),
  account('g1', '1', 'Aktiven', 'group'),
  account('a1000', '1000', 'Kasse', 'leaf', 'g1'),
  account('a1010', '1010', 'PostFinance', 'leaf', 'g1'),
  account('a1020', '01020', 'ZKB', 'leaf', 'g1'),          // padded like the bexio account sync
  account('a1807', '1807', 'Säule 3a', 'leaf', 'g1'),
  account('g2050', '2050', 'Kreditkarten', 'group'),        // a group with a leaf's number
  account('l2050a', '2050', 'MC', 'leaf', 'g2050'),
  account('a2060', '2060', 'VISA', 'leaf'),
  account('a2062', '2062', 'VZ VISA', 'leaf'),
  account('a2064', '2064', 'Cashback', 'leaf'),
  account('a3250', '3250', 'Zinsertrag', 'leaf'),
  account('a3419', '3419', 'Lohn', 'leaf'),
  account('a4210', '4210', 'Software', 'leaf'),
  account('a4230', '4230', 'Repair', 'leaf'),
  account('a5822', '5822', 'Lodging', 'leaf'),
  account('a6282', '6282', 'Transport', 'leaf'),
  account('x6720', '6720', 'Unbekannt A', 'leaf'),
  account('y6720', '6720', 'Unbekannt B', 'leaf'),          // ambiguous
  account('g9200', '9200', 'Abschluss', 'group'),
];

describe('normalizeAccountNo', () => {
  it('drops leading zeros only', () => {
    expect(normalizeAccountNo('01020')).toBe('1020');
    expect(normalizeAccountNo('1020')).toBe('1020');
    expect(normalizeAccountNo(' 0 ')).toBe('0');
    expect(normalizeAccountNo('')).toBe('');
  });
});

describe('importableJournalRows', () => {
  it('keeps manual rows with an amount, drops opening/closing and zero rows', () => {
    const rows = importableJournalRows(journal);
    expect(rows).toHaveLength(10);
    expect(rows.every(r => r.kind === 'manual' && r.amount !== 0)).toBe(true);
    expect(rows.map(r => r.id)).toEqual(['592', '588', '587', '586', '385', '510', '407', '489', '475', '500']);
  });
});

describe('resolveJournalAccounts', () => {
  const rows = importableJournalRows(journal);
  const mapping = resolveJournalAccounts(rows, chart);

  it('lists every used number once, sorted, with its bucket', () => {
    expect(mapping.map(m => `${m.no}:${m.match}`)).toEqual([
      '1010:matched', '1020:matched', '1807:matched', '2050:matched', '2060:matched', '2062:matched', '2064:matched',
      '2850:missing', '3250:matched', '3419:matched', '4210:matched', '4230:matched', '5822:matched', '6282:matched', '6720:ambiguous', '9200:group',
    ]);
  });
  it('matches by number ignoring padding and carries both names', () => {
    expect(mapping.find(m => m.no === '1020')).toEqual({ no: '1020', name: 'ZKB priv CHF', accountKey: 'a1020', accountName: 'ZKB', match: 'matched' });
    expect(mapping.find(m => m.no === '2050')).toMatchObject({ accountKey: 'l2050a', match: 'matched' });
  });
  it('leaves missing, group and ambiguous numbers unresolved', () => {
    for (const no of ['2850', '6720', '9200']) expect(mapping.find(m => m.no === no)).toMatchObject({ accountKey: '', accountName: '' });
  });
  it('ignores archived accounts', () => {
    const archived = chart.map(a => a.okey === 'a1010' ? { ...a, isArchived: true } : a);
    expect(resolveJournalAccounts(rows, archived).find(m => m.no === '1010')!.match).toBe('missing');
  });
});

describe('journalAccountSums / compareJournalSums', () => {
  const rows = importableJournalRows(journal);
  const sums = journalAccountSums(rows);
  it('sums debit minus credit per number in base currency', () => {
    expect(sums.get('1020')).toBe(500000 - 36000);           // 385 debit, 407 credit
    expect(sums.get('6720')).toBe(142361 + 580790);
    expect(sums.get('5822')).toBe(14518);                     // EUR row counted in CHF
    expect(sums.get('2060')).toBe(-916 - 14518);
  });
  it('reports only numbers whose ledger sum differs', () => {
    const mapping = [{ no: '1020', name: '', accountKey: 'a1020', accountName: '', match: 'matched' as const }, { no: '5822', name: '', accountKey: 'a5822', accountName: '', match: 'matched' as const }];
    expect(compareJournalSums(sums, mapping, { a1020: 464000, a5822: 0 })).toEqual([{ no: '5822', accountKey: 'a5822', file: 14518, ledger: 0 }]);
    expect(compareJournalSums(sums, mapping, { a1020: 464000, a5822: 14518 })).toEqual([]);
  });
});

describe('toJournalEntries', () => {
  const rows = importableJournalRows(journal);
  it('builds the payload from the mapping; description falls back to the reference', () => {
    const mapping = resolveJournalAccounts(rows, chart).map(m => ({ ...m, accountKey: m.accountKey || `k${m.no}` }));
    const entries = toJournalEntries(rows, mapping);
    expect(entries).toHaveLength(10);
    expect(entries[0]).toEqual({ id: '592', date: '20221231', title: 'Saldo-Korrektur', reference: 'Manuelle Buchung 354 ()',
      debitAccountKey: 'k6720', creditAccountKey: 'a2064', amount: 142361, currency: 'CHF', amountBase: 142361, baseCurrency: 'CHF' });
    expect(entries[1].title).toBe('Manuelle Buchung 350 ()');
    expect(entries.find(e => e.id === '500')).toMatchObject({ amount: 14780, currency: 'EUR', amountBase: 14518, baseCurrency: 'CHF', debitAccountKey: 'a5822' });
    expect(entries.find(e => e.id === '510')).toMatchObject({ debitAccountKey: 'a6282', creditAccountKey: 'a2060' });
  });
  it('throws when a used number is unmapped', () => {
    expect(() => toJournalEntries(rows, resolveJournalAccounts(rows, chart))).toThrowError(/account 6720 is not mapped/);
  });
});

describe('journalAccountMapValidations', () => {
  it('is valid only when every entry has an account', () => {
    const ok = { entries: [{ no: '1', name: '', accountKey: 'a', accountName: '', match: 'matched' as const }] };
    expect(journalAccountMapValidations(ok, '', '').isValid()).toBe(true);
    const bad = { entries: [...ok.entries, { no: '2', name: '', accountKey: '', accountName: '', match: 'missing' as const }] };
    expect(journalAccountMapValidations(bad, '', '').isValid()).toBe(false);
    expect(journalAccountMapValidations({ entries: [] }, '', '').isValid()).toBe(true);
  });
});

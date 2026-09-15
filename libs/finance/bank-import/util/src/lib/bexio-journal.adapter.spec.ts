import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { matchesBexioJournalHeader, parseBexioJournal, splitBexioAccount } from './bexio-journal.adapter';

const text = readFileSync(join(__dirname, 'fixtures/bexio-journal-sample.csv'), 'utf8');

describe('parseBexioJournal', () => {
  const j = parseBexioJournal(text);

  it('detects the multi-line quoted header and rejects other files', () => {
    expect(matchesBexioJournalHeader(text)).toBe(true);
    expect(matchesBexioJournalHeader('Datum;Buchungstext;Konto;Whg\n')).toBe(false);
    expect(matchesBexioJournalHeader('Id,Datum,Referenz,Soll,Haben,Beschreibung,Betrag\n1,01.01.2023,x,1000 - A,2000 - B,d,1.00')).toBe(true);
    expect(matchesBexioJournalHeader('')).toBe(false);
  });

  it('yields one row per journal entry, newest first, with the date range and base currency', () => {
    expect(j.rows).toHaveLength(18);
    expect(j).toMatchObject({ format: 'bexio-journal', baseCurrency: 'CHF', dateFrom: '20181231', dateTo: '20230101', newestFirst: true, warnings: [] });
  });

  it('repairs the UTF-8-as-Latin-1 encoding and collapses the padded cells', () => {
    expect(j.rows[0]).toEqual({
      id: '621', date: '20230101', reference: 'Eröffnungsbuchung 621', kind: 'opening',
      debitAccountNo: '9100', debitAccountName: 'Eröffnungsbilanz', creditAccountNo: '2850', creditAccountName: 'Vermögen',
      description: 'Saldovortrag 1.1.2023', amount: 324466489, currency: 'CHF', fxRate: 1, amountBase: 324466489, baseCurrency: 'CHF', vat: '', lineNo: 26,
    });
    expect(j.rows[1].reference).toBe('Eröffnungsbuchung 620');
    expect(j.rows.find(r => r.id === '385')).toMatchObject({ date: '20221230', description: 'Übertrag PF Max -> ZKB priv' });
    expect(j.rows.find(r => r.id === '407')).toMatchObject({ debitAccountNo: '4230', debitAccountName: 'Office - Repair', description: 'Office Repair (5)' });
    expect(j.rows.find(r => r.id === '489')).toMatchObject({ creditAccountNo: '3419', creditAccountName: 'Lohn diverse' });
  });

  it('keeps account names with commas, empty descriptions and zero amounts', () => {
    expect(j.rows.find(r => r.id === '619')).toMatchObject({ debitAccountNo: '1902', debitAccountName: 'Immobilie Musterstr. 1, Stäfa' });
    expect(j.rows.find(r => r.id === '588')).toMatchObject({ description: '', amount: 580790 });
    expect(j.rows.find(r => r.id === '526')).toMatchObject({ kind: 'opening', amount: 0, amountBase: 0 });
  });

  it('classifies the reference and carries VAT and FX columns', () => {
    expect(j.rows.find(r => r.id === '592')!.kind).toBe('manual');
    expect(j.rows.find(r => r.id === '318')).toMatchObject({ kind: 'closing', creditAccountNo: '9901' });
    expect(j.rows.find(r => r.id === '475')!.vat).toBe('UN81');
    expect(j.rows.find(r => r.id === '500')).toMatchObject({ amount: 14780, currency: 'EUR', fxRate: 0.9823, amountBase: 14518, baseCurrency: 'CHF', description: 'Hotel, Madrid' });
    expect(j.rows[j.rows.length - 1]).toMatchObject({ id: '193', lineNo: 89 });
  });

  it('lists every account of the file once, sorted by number', () => {
    expect(j.accounts.map(a => a.no)).toEqual(['1000', '1010', '1020', '1807', '1902', '2050', '2060', '2062', '2064', '2500', '2602', '2850', '3250', '3419', '4210', '4230', '5822', '6282', '6720', '9100', '9200', '9901']);
    expect(j.accounts.find(a => a.no === '9901')).toEqual({ no: '9901', name: 'Saldoübernahme' });
  });

  it('skips a row with an unreadable date or amount with a warning naming the line', () => {
    const bad = parseBexioJournal(text.replace('621,01.01.2023', '621,2023-01-01').replace(',5807.90,CHF,1,', ',abc,CHF,1,'));
    expect(bad.rows).toHaveLength(16);
    expect(bad.warnings).toEqual([
      { code: 'line-skipped', lineNo: 26, detail: '2023-01-01' },
      { code: 'line-skipped', lineNo: 37, detail: 'amount' },
    ]);
  });

  it('throws on an empty file and on a file without the journal columns', () => {
    expect(() => parseBexioJournal('')).toThrowError(/empty-file/);
    expect(() => parseBexioJournal('Datum;Buchungstext\n1;2')).toThrowError(/unknown-format/);
  });
});

describe('splitBexioAccount', () => {
  it('splits "no - name" and tolerates a bare number or name', () => {
    expect(splitBexioAccount('9100 - Eröffnungsbilanz')).toEqual({ no: '9100', name: 'Eröffnungsbilanz' });
    expect(splitBexioAccount('6720 - Misc - Unbekannt')).toEqual({ no: '6720', name: 'Misc - Unbekannt' });
    expect(splitBexioAccount('1020')).toEqual({ no: '1020', name: '' });
    expect(splitBexioAccount('Kasse')).toEqual({ no: '', name: 'Kasse' });
    expect(splitBexioAccount('')).toEqual({ no: '', name: '' });
  });
});

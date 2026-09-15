import { describe, expect, it } from 'vitest';

import { AccountModel } from '@okr/shared-models';

import {
  buildImportedChartOfAccounts, chartOfAccountsToRows, ChartOfAccountsCsvError, detectDelimiter,
  getAccountKind, parseChartOfAccountsCsv, splitCsvLine
} from './chart-of-accounts-csv';

const CSV = `Nummer,Name,Gruppe,Kontoart
1,Aktiven,,Gruppe
10,Umlaufvermögen UV,1,Gruppe
1000,Kassenkonto Kasse CHF,10,Aktiv
1531,"Wertsachen (Gold, Schmuck, Safe)",10,Aktiv
2,Passiven,,Gruppe
2060,VISA PF Platinum,200,Passiv
2601,STEG Rain73 Renofonds,2,Aktiv
9000,Erfolgsrechnung,,Komplett
`;

describe('chart of accounts csv', () => {
  describe('low level', () => {
    it('detects the delimiter from the header', () => {
      expect(detectDelimiter('Nummer,Name,Gruppe,Kontoart')).toBe(',');
      expect(detectDelimiter('Nummer;Name;Gruppe;Kontoart')).toBe(';');
    });

    it('splits quoted fields with embedded delimiters and doubled quotes', () => {
      expect(splitCsvLine('1531,"Wertsachen (Gold, Schmuck, Safe)",150,Aktiv', ','))
        .toEqual(['1531', 'Wertsachen (Gold, Schmuck, Safe)', '150', 'Aktiv']);
      expect(splitCsvLine('a;"say ""hi""";c', ';')).toEqual(['a', 'say "hi"', 'c']);
    });
  });

  describe('parseChartOfAccountsCsv', () => {
    it('parses rows by header name, skipping blank lines and a BOM', () => {
      const rows = parseChartOfAccountsCsv('﻿' + CSV.replace(/\n/g, '\r\n'));
      expect(rows).toHaveLength(8);
      expect(rows[0]).toEqual({ id: '1', name: 'Aktiven', parentId: '', kind: 'Gruppe' });
      expect(rows[3]).toEqual({ id: '1531', name: 'Wertsachen (Gold, Schmuck, Safe)', parentId: '10', kind: 'Aktiv' });
    });

    it('accepts semicolon files and a different column order', () => {
      const rows = parseChartOfAccountsCsv('Name;Nummer\nKasse;1000\n');
      expect(rows).toEqual([{ id: '1000', name: 'Kasse', parentId: '', kind: '' }]);
    });

    it('rejects an empty file and a file without the required columns', () => {
      expect(() => parseChartOfAccountsCsv('')).toThrow(ChartOfAccountsCsvError);
      expect(() => parseChartOfAccountsCsv('Nummer,Name\n')).toThrow(ChartOfAccountsCsvError);
      expect(() => parseChartOfAccountsCsv('Foo,Bar\n1,2\n')).toThrow(ChartOfAccountsCsvError);
    });
  });

  describe('buildImportedChartOfAccounts', () => {
    const result = buildImportedChartOfAccounts(parseChartOfAccountsCsv(CSV), 'tenant-1', 'org-1', 'root-1', 'Privat');
    const byId = (id: string) => result.accounts.find(a => a.id === id);

    it('creates one root plus one account per row with root-scoped okeys', () => {
      expect(result.accounts).toHaveLength(9);
      expect(result.accounts[0].type).toBe('root');
      expect(result.accounts[0].okey).toBe('root-1');
      expect(result.accounts[0].name).toBe('Privat');
      expect(byId('1000')?.okey).toBe('root-1-1000');
      expect(result.accounts.every(a => a.accountingTenantId === 'org-1' && a.tenants[0] === 'tenant-1')).toBe(true);
    });

    it('wires parents by number, top-level rows under the root', () => {
      expect(byId('1')?.parentKey).toBe('root-1');
      expect(byId('10')?.parentKey).toBe('root-1-1');
      expect(byId('1000')?.parentKey).toBe('root-1-10');
    });

    it('maps Kontoart to type and keeps the kind in label for leaves', () => {
      expect(byId('1')?.type).toBe('group');
      expect(byId('1000')?.type).toBe('leaf');
      expect(byId('1000')?.label).toBe('Aktiv');
      expect(byId('2601')?.label).toBe('Aktiv');
      expect(byId('1')?.label).toBe('');
    });

    it('attaches rows with an unknown parent to the root and reports them', () => {
      expect(byId('2060')?.parentKey).toBe('root-1');
      expect(result.orphans).toEqual(['2060']);
    });

    it('keeps only the first of duplicate numbers and reports the rest', () => {
      const dup = buildImportedChartOfAccounts(
        [{ id: '1', name: 'A', parentId: '', kind: '' }, { id: '1', name: 'B', parentId: '', kind: '' }],
        't', 'o', 'r', 'R');
      expect(dup.accounts).toHaveLength(2);
      expect(dup.accounts[1].name).toBe('A');
      expect(dup.duplicates).toEqual(['1']);
    });

    it('treats a row that is somebody\'s parent as a group even without Kontoart', () => {
      const r = buildImportedChartOfAccounts(
        [{ id: '1', name: 'A', parentId: '', kind: '' }, { id: '10', name: 'B', parentId: '1', kind: '' }],
        't', 'o', 'r', 'R');
      expect(r.accounts[1].type).toBe('group');
      expect(r.accounts[2].type).toBe('leaf');
    });
  });

  describe('export', () => {
    it('derives the kind from the number when no label is stored', () => {
      const a = new AccountModel('t');
      a.id = '2060'; expect(getAccountKind(a)).toBe('Passiv');
      a.id = '3401'; expect(getAccountKind(a)).toBe('Ertrag');
      a.id = '5010'; expect(getAccountKind(a)).toBe('Aufwand');
      a.id = '9000'; expect(getAccountKind(a)).toBe('Komplett');
      a.id = '2601'; a.label = 'Aktiv'; expect(getAccountKind(a)).toBe('Aktiv');
    });

    it('round-trips the import in tree order with parent numbers', () => {
      const { accounts } = buildImportedChartOfAccounts(parseChartOfAccountsCsv(CSV), 't', 'o', 'r', 'R');
      const rows = chartOfAccountsToRows(accounts);
      expect(rows[0]).toEqual(['Nummer', 'Name', 'Gruppe', 'Kontoart']);
      expect(rows.slice(1)).toEqual([
        ['1', 'Aktiven', '', 'Gruppe'],
        ['10', 'Umlaufvermögen UV', '1', 'Gruppe'],
        ['1000', 'Kassenkonto Kasse CHF', '10', 'Aktiv'],
        ['1531', 'Wertsachen (Gold, Schmuck, Safe)', '10', 'Aktiv'],
        ['2', 'Passiven', '', 'Gruppe'],
        ['2601', 'STEG Rain73 Renofonds', '2', 'Aktiv'],
        ['2060', 'VISA PF Platinum', '', 'Passiv'],   // orphan: re-attached to the root
        ['9000', 'Erfolgsrechnung', '', 'Komplett'],
      ]);
    });

    it('exports only the given roots', () => {
      const a = buildImportedChartOfAccounts([{ id: '1', name: 'A', parentId: '', kind: '' }], 't', 'o', 'ra', 'A');
      const b = buildImportedChartOfAccounts([{ id: '2', name: 'B', parentId: '', kind: '' }], 't', 'o', 'rb', 'B');
      const all = [...a.accounts, ...b.accounts];
      expect(chartOfAccountsToRows(all)).toHaveLength(3);
      expect(chartOfAccountsToRows(all, [b.accounts[0]]).slice(1)).toEqual([['2', 'B', '', 'Passiv']]);
    });
  });
});

import { describe, expect, it } from 'vitest';

import { collapseWhitespace, normalizeIban, parseAmountMinor, parseCsvLine, parseCsvRecords, parseDdMmYyyy, parseIsoDate, splitLines, stripBom } from './csv.util';

describe('csv.util', () => {
  it('stripBom removes a leading UTF-8 BOM only', () => {
    expect(stripBom('﻿Datum;x')).toBe('Datum;x');
    expect(stripBom('Datum;x')).toBe('Datum;x');
  });

  it('splitLines normalizes CRLF and keeps blank lines (adapters use them as separators)', () => {
    expect(splitLines('a\r\n\r\nb\n')).toEqual(['a', '', 'b', '']);
  });

  it('parseCsvLine handles quoted fields, embedded separators and doubled quotes', () => {
    expect(parseCsvLine('31.12.2025;Buchung;"A; B";975;')).toEqual(['31.12.2025', 'Buchung', 'A; B', '975', '']);
    expect(parseCsvLine('"Datum";"Buchungstext";"Konto"')).toEqual(['Datum', 'Buchungstext', 'Konto']);
    expect(parseCsvLine('"He said ""hi""";1')).toEqual(['He said "hi"', '1']);
    expect(parseCsvLine('Konto:;="CH5109000000418858226"')).toEqual(['Konto:', '=CH5109000000418858226']);
  });

  it('parseAmountMinor parses Swiss formats into minor units', () => {
    expect(parseAmountMinor('975')).toBe(97500);
    expect(parseAmountMinor('-5')).toBe(-500);
    expect(parseAmountMinor('80.3')).toBe(8030);
    expect(parseAmountMinor("1'463.00")).toBe(146300);
    expect(parseAmountMinor('5852,05')).toBe(585205);
    expect(parseAmountMinor('7.31')).toBe(731);
    expect(parseAmountMinor('')).toBeUndefined();
    expect(parseAmountMinor('abc')).toBeUndefined();
  });

  it('parseDdMmYyyy converts to StoreDate and rejects garbage', () => {
    expect(parseDdMmYyyy('31.12.2025')).toBe('20251231');
    expect(parseDdMmYyyy('1.2.2025')).toBe('20250201');
    expect(parseDdMmYyyy('15/03/2025')).toBe('20250315');
    expect(parseDdMmYyyy('15/03.2025')).toBe('20250315');
    expect(parseDdMmYyyy('2025-12-31')).toBeUndefined();
    expect(parseDdMmYyyy('')).toBeUndefined();
  });

  it('parseIsoDate converts the card export\'s yyyy-mm-dd and rejects the other layouts', () => {
    expect(parseIsoDate('2023-01-22')).toBe('20230122');
    expect(parseIsoDate('2023-1-2')).toBe('20230102');
    expect(parseIsoDate('22.01.2023')).toBeUndefined();
    expect(parseIsoDate('2023-02-30')).toBeUndefined();
    expect(parseIsoDate('')).toBeUndefined();
  });

  it('collapseWhitespace and normalizeIban', () => {
    expect(collapseWhitespace('  a   b \t c ')).toBe('a b c');
    expect(normalizeIban('CH98 0070 0112 9000 6934 5')).toBe('CH9800700112900069345');
    expect(normalizeIban(' ch51 0900 ')).toBe('CH510900');
  });
});

describe('parseCsvRecords', () => {
  it('splits records across quoted newlines and reports the line a record starts on', () => {
    const text = '"\n  Id\n","\n  Datum\n"\n1,"a\nb",c\r\n\n2,x,"y ""z"""';
    expect(parseCsvRecords(text, ',')).toEqual([
      { fields: ['Id', 'Datum'], lineNo: 1 },
      { fields: ['1', 'a\nb', 'c'], lineNo: 6 },
      { fields: ['2', 'x', 'y "z"'], lineNo: 9 },
    ]);
  });
  it('trims fields, strips a BOM and drops blank records', () => {
    expect(parseCsvRecords('﻿a; b ;c\n\n', ';')).toEqual([{ fields: ['a', 'b', 'c'], lineNo: 1 }]);
    expect(parseCsvRecords('', ';')).toEqual([]);
  });
});

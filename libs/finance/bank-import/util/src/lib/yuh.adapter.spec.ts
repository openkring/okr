import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { splitLines } from './csv.util';
import { matchesYuhHeader, parseYuh } from './yuh.adapter';

const text = readFileSync(join(__dirname, 'fixtures/yuh-sample.csv'), 'utf8');

describe('parseYuh', () => {
  const s = parseYuh(text);

  it('detects the header; no IBAN in the file, oldest first', () => {
    expect(matchesYuhHeader(splitLines(text))).toBe(true);
    expect(matchesYuhHeader(['Datum;Buchungstext;Konto;Whg'])).toBe(false);
    expect(s).toMatchObject({ format: 'yuh', iban: '', currency: 'CHF', bankName: 'Yuh', dateFrom: '', dateTo: '', newestFirst: false });
  });

  it('keeps the 52 money movements and drops the reward rows without a warning', () => {
    expect(s.rows).toHaveLength(52);
    expect(s.warnings).toEqual([]);
    expect(s.rows.some(r => r.rawText.includes('Kartenbonus'))).toBe(false);
  });

  it('dd/mm/yyyy dates, DEBIT negative, CREDIT positive, no saldo, no reference', () => {
    expect(s.rows[0]).toMatchObject({ date: '20250320', amount: 373, currency: 'CHF', bankReference: '', lineNo: 3 });
    expect(s.rows[0].saldo).toBeUndefined();
    expect(s.rows[2]).toMatchObject({ date: '20250325', amount: -7983 });
    expect(s.rows[s.rows.length - 1]).toMatchObject({ date: '20260818', amount: -2500, lineNo: 78 });
  });

  it('strips the triple quotes; rawText is name + locality, payee is RECIPIENT for debits and SENDER for credits', () => {
    expect(s.rows[0]).toMatchObject({ rawText: 'Überweisung von Muster, Max', payee: 'Muster, Max' });
    expect(s.rows[2]).toMatchObject({ rawText: 'PAYPAL *COLORNDRIVE 15147220949, DE', payee: 'PAYPAL *COLORNDRIVE' });
    expect(s.rows.find(r => r.rawText.startsWith('Zattoo'))).toMatchObject({ rawText: 'Zattoo Zürich, CH', payee: 'Zattoo' });
    expect(s.rows.find(r => r.rawText.startsWith('Twint an MUSTER DIETER'))!.payee).toBe('MUSTER DIETER');
    expect(s.rows.find(r => r.rawText.startsWith('Twint von'))).toMatchObject({ amount: 8500, payee: 'MUSTER SASKIA' });
  });

  it('warns on a bad date and on a dateless money row', () => {
    const broken = text.replace('25/03/2025;CARD_TRANSACTION_OUT', '2025-03-25;CARD_TRANSACTION_OUT');
    expect(parseYuh(broken).warnings).toEqual([{ code: 'line-skipped', lineNo: 5, detail: '2025-03-25' }]);
    const noAmount = text.replace(';-79.83;CHF;', ';;;');
    expect(parseYuh(noAmount).warnings).toEqual([{ code: 'line-skipped', lineNo: 5, detail: 'amount' }]);
  });
});

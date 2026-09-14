import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { splitLines } from './csv.util';
import { extractZkbPayee, matchesZkbHeader, parseZkb } from './zkb.adapter';

const text = readFileSync(join(__dirname, 'fixtures/zkb-sample.csv'), 'utf8');

describe('parseZkb', () => {
  const s = parseZkb(text);

  it('detects the header; IBAN from the Konto column, normalized', () => {
    expect(matchesZkbHeader(splitLines(text))).toBe(true);
    expect(matchesZkbHeader(['Datum;Bewegungstyp;Avisierungstext'])).toBe(false);
    expect(s).toMatchObject({ format: 'zkb', iban: 'CH9800700112900069345', currency: 'CHF', bankName: 'Zürcher Kantonalbank', dateFrom: '', dateTo: '' });
  });

  it('parses 17 rows, skips the row of a second IBAN with a warning', () => {
    expect(s.rows).toHaveLength(17);
    expect(s.warnings).toEqual([{ code: 'iban-mismatch', lineNo: 19, detail: 'CH1100700112900000000' }]);
  });

  it('Belastung is negative, Gutschrift positive, Rückerstattung positive', () => {
    expect(s.rows[0]).toMatchObject({ date: '20251231', amount: -585205, bankReference: '', lineNo: 2 });
    expect(s.rows[2]).toMatchObject({ amount: 300000 });
    expect(s.rows.find(r => r.rawText.startsWith('Rückerstattung'))!.amount).toBe(6990);
  });

  it('flattened collectives are separate rows', () => {
    expect(s.rows.filter(r => r.rawText.includes('Belastungen Mobile Banking (2)'))).toHaveLength(2);
  });

  it('never extracts FX (the EUR suffix is a merchant token)', () => {
    expect(s.rows.find(r => r.rawText.includes('APRR'))!.amountFx).toBeUndefined();
  });
});

describe('extractZkbPayee', () => {
  it('finds the counterparty per pattern', () => {
    expect(extractZkbPayee('Belastung TWINT: MUSTER, CARLA +41760000000')).toBe('MUSTER, CARLA');
    expect(extractZkbPayee('Belastung TWINT: PARKINGPAY-TWINT SCHLIEREN')).toBe('PARKINGPAY-TWINT SCHLIEREN');
    expect(extractZkbPayee('Gutschrift Auftraggeber: Muster A. und/oder Muster B., Rainstrasse 1 Muster, 8712 Staefa, CH')).toBe('Muster A. und/oder Muster B.');
    expect(extractZkbPayee('Belastung Mobile Banking: SLKK, Hofwiesenstrasse 370, 8050 Zürich, CH SLKK')).toBe('SLKK');
    expect(extractZkbPayee('Belastung eBill: Swisscom (Schweiz) AG, Alte Tiefenaustrasse 6')).toBe('Swisscom (Schweiz) AG');
    expect(extractZkbPayee('Belastung Dauerauftrag: Muster Anna u/o Muster Beat Muster Anna, Rainstrasse 1')).toBe('Muster Anna u/o Muster Beat Muster Anna');
    expect(extractZkbPayee('Gutschrift Salär: Spitex Stafa, Seestrasse 23')).toBe('Spitex Stafa');
    expect(extractZkbPayee('Gutschrift Rente: SVA ZÜRICH, Röntgenstrasse 17')).toBe('SVA ZÜRICH');
    expect(extractZkbPayee('Belastungen Mobile Banking (2) Krankenkasse SLKK, Hofwiesenstrasse 370')).toBe('Krankenkasse SLKK');
    expect(extractZkbPayee('Belastungen eBanking Mobile (3) Strassenverkehrsamt Kanton Zürich, Uetlibergstrasse 301')).toBe('Strassenverkehrsamt Kanton Zürich');
    expect(extractZkbPayee('Einkauf ZKB Visa Debit Card Nr. xxxx 0688, Coop-1361 Sedrun 0718')).toBe('Coop-1361 Sedrun 0718');
    expect(extractZkbPayee('Online-Einkauf ZKB Visa Debit Card Nr. xxxx 6267, Odlo Outlet')).toBe('Odlo Outlet');
    expect(extractZkbPayee('Bezug ZKB Visa Debit Card Nr. xxxx 6267, ZKB STAEFA 1')).toBe('ZKB STAEFA 1');
    expect(extractZkbPayee('Rückerstattung ZKB Visa Debit Card Nr. xxxx 0688, Marc OPolo Store')).toBe('Marc OPolo Store');
    expect(extractZkbPayee('Belastung aus Lastschrift mit Widerspruch: CORNERCARD SWITZERLAND, VIA CANOVA')).toBe('CORNERCARD SWITZERLAND');
    expect(extractZkbPayee('Miete ZKB Schrankfach Periode vom 01.07.2025 bis 30.09.2025')).toBe('ZKB');
    expect(extractZkbPayee('IHR NOTEN ANKAUF')).toBe('');
  });
});

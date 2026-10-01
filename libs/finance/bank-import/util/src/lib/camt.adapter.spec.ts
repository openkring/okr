import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { generateQrReference } from '@okr/shared-util-core';

import { matchesCamtHeader, parseCamt } from './camt.adapter';
import { splitLines } from './csv.util';
import { parseStatement } from './format-registry';

const c054 = readFileSync(join(__dirname, 'fixtures/camt054-sample.xml'), 'utf8');
const c053 = readFileSync(join(__dirname, 'fixtures/camt053-sample.xml'), 'utf8');

describe('parseCamt (camt.054)', () => {
  const s = parseCamt(c054);

  it('is detected and routed by the registry', () => {
    expect(matchesCamtHeader(splitLines(c054))).toBe(true);
    expect(parseStatement(c054).format).toBe('camt');
  });
  it('reads account, currency and period', () => {
    expect(s.iban).toBe('CH9300762011623852957');
    expect(s.currency).toBe('CHF');
    expect(s.dateFrom).toBe('20261001');
    expect(s.dateTo).toBe('20261001');
  });
  it('splits a batch entry into one row per TxDtls, in minor units', () => {
    expect(s.rows.map(r => r.amount)).toEqual([12000, 8050, 5000, -1990]);
  });
  it('carries the normalized creditor reference and the debtor as payee', () => {
    expect(s.rows[0].paymentReference).toBe(generateQrReference(202600042));
    expect(s.rows[0].payee).toBe('Hans Muster');
    expect(s.rows[0].bankReference).toBe('ZKB-TX-1');
    expect(s.rows[1].paymentReference).toBe('');
    expect(s.rows[1].rawText).toContain('Mitgliederbeitrag');
  });
  it('an entry without TxDtls is one row with the entry reference and text', () => {
    expect(s.rows[2].bankReference).toBe('ZKB-ENTRY-2');
    expect(s.rows[2].rawText).toContain('Gutschrift Spende');
  });
  it('a debit is negative and names the creditor', () => {
    expect(s.rows[3].payee).toBe('Swisscom');
    expect(s.rows[3].date).toBe('20261001');
  });
});

describe('parseCamt (camt.053)', () => {
  const s = parseCamt(c053);
  it('reads a statement and falls back to the value date', () => {
    expect(matchesCamtHeader(splitLines(c053))).toBe(true);
    expect(s.rows).toHaveLength(1);
    expect(s.rows[0].amount).toBe(7500);
    expect(s.rows[0].date).toMatch(/^\d{8}$/);
  });
});

describe('matchesCamtHeader', () => {
  it('rejects CSV', () => {
    expect(matchesCamtHeader(['Datum;Buchungstext;Betrag'])).toBe(false);
  });
});

describe('parseCamt (robustness)', () => {
  const wrap = (ntries: string): string =>
    `<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.054.001.08"><BkToCstmrDbtCdtNtfctn><Ntfctn>` +
    `<Acct><Id><IBAN>CH9300762011623852957</IBAN></Id></Acct>${ntries}</Ntfctn></BkToCstmrDbtCdtNtfctn></Document>`;
  const ntry = (inner: string, extra = ''): string =>
    `<Ntry><Amt Ccy="CHF">200.00</Amt><CdtDbtInd>CRDT</CdtDbtInd>${extra}<BookgDt><Dt>2026-10-01</Dt></BookgDt>${inner}</Ntry>`;

  it('uses AmtDtls/TxAmt/Amt for a batch TxDtls without its own Amt', () => {
    const s = parseCamt(wrap(ntry('<NtryDtls><TxDtls><Amt Ccy="CHF">120.00</Amt></TxDtls><TxDtls><AmtDtls><TxAmt><Amt Ccy="CHF">80.00</Amt></TxAmt></AmtDtls></TxDtls></NtryDtls>')));
    expect(s.rows.map(r => r.amount)).toEqual([12000, 8000]);
  });
  it('skips a batch TxDtls with no amount instead of booking the entry total', () => {
    const s = parseCamt(wrap(ntry('<NtryDtls><TxDtls><Amt Ccy="CHF">120.00</Amt></TxDtls><TxDtls><AddtlTxInf>x</AddtlTxInf></TxDtls></NtryDtls>')));
    expect(s.rows.map(r => r.amount)).toEqual([12000]);
    expect(s.warnings).toHaveLength(1);
    expect(s.warnings[0].code).toBe('line-skipped');
  });
  it('skips a malformed amount with a warning', () => {
    const s = parseCamt(wrap(ntry('').replace('200.00', 'abc')));
    expect(s.rows).toHaveLength(0);
    expect(s.warnings[0].code).toBe('line-skipped');
  });
  it('skips a non-booked entry with a warning', () => {
    const s = parseCamt(wrap(ntry('', '<Sts><Cd>PDNG</Cd></Sts>') + ntry('', '<Sts>BOOK</Sts>')));
    expect(s.rows).toHaveLength(1);
    expect(s.warnings).toHaveLength(1);
    expect(s.warnings[0].code).toBe('line-skipped');
  });
  it('flips the sign of a reversal', () => {
    const s = parseCamt(wrap(ntry('', '<RvslInd>true</RvslInd>')));
    expect(s.rows[0].amount).toBe(-20000);
  });
  it('a single TxDtls without Amt uses the entry amount', () => {
    const s = parseCamt(wrap(ntry('<NtryDtls><TxDtls><AddtlTxInf>x</AddtlTxInf></TxDtls></NtryDtls>')));
    expect(s.rows.map(r => r.amount)).toEqual([20000]);
  });
});

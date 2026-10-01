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
  it('skips a reversal entry with a Storno warning', () => {
    const s = parseCamt(wrap(ntry('', '<RvslInd>true</RvslInd>')));
    expect(s.rows).toHaveLength(0);
    expect(s.warnings).toHaveLength(1);
    expect(s.warnings[0].detail).toContain('Storno');
  });
  it('skips an entry without a usable date', () => {
    const s = parseCamt(wrap(ntry('').replace('<BookgDt><Dt>2026-10-01</Dt></BookgDt>', '')));
    expect(s.rows).toHaveLength(0);
    expect(s.warnings[0].code).toBe('line-skipped');
  });
  it('rejects several accounts in one file', () => {
    const stmt = (iban: string): string => `<Ntfctn><Acct><Id><IBAN>${iban}</IBAN></Id></Acct></Ntfctn>`;
    const doc = (a: string, b: string): string => `<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.054.001.08"><BkToCstmrDbtCdtNtfctn>${stmt(a)}${stmt(b)}</BkToCstmrDbtCdtNtfctn></Document>`;
    expect(() => parseCamt(doc('CH9300762011623852957', 'CH5604835012345678009'))).toThrow(/several accounts/);
  });
  it('merges several statements of the same account, dateTo from the last', () => {
    const stmt = (to: string): string => `<Stmt><FrToDt><FrDtTm>2026-10-01T00:00:00</FrDtTm><ToDtTm>${to}T23:59:59</ToDtTm></FrToDt><Acct><Id><IBAN>CH9300762011623852957</IBAN></Id></Acct>${ntry('')}</Stmt>`;
    const s = parseCamt(`<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.04"><BkToCstmrStmt>${stmt('2026-10-01')}${stmt('2026-10-05')}</BkToCstmrStmt></Document>`);
    expect(s.rows).toHaveLength(2);
    expect(s.dateTo).toBe('20261005');
  });
  it('accepts a prefixed Document root', () => {
    expect(matchesCamtHeader(['<ns2:Document xmlns:ns2="urn:iso:std:iso:20022:tech:xsd:camt.053.001.04">'])).toBe(true);
  });
  it('prefers the counter value in the account currency', () => {
    const s = parseCamt(wrap(ntry('<NtryDtls><TxDtls><AmtDtls><TxAmt><Amt Ccy="EUR">90.00</Amt></TxAmt><CntrValAmt><Amt Ccy="CHF">100.00</Amt></CntrValAmt></AmtDtls></TxDtls></NtryDtls>').replace('<Acct>', '<Acct>')).replace('</IBAN></Id>', '</IBAN></Id><Ccy>CHF</Ccy>'));
    expect(s.rows[0].amount).toBe(10000);
    expect(s.rows[0].currency).toBe('CHF');
  });
  it('reads TxDtls from every NtryDtls', () => {
    const s = parseCamt(wrap(ntry('<NtryDtls><TxDtls><Amt Ccy="CHF">1.00</Amt></TxDtls></NtryDtls><NtryDtls><TxDtls><Amt Ccy="CHF">2.00</Amt></TxDtls></NtryDtls>')));
    expect(s.rows.map(r => r.amount)).toEqual([100, 200]);
  });
  it('joins AddtlTxInf and Ustrd in rawText', () => {
    const s = parseCamt(wrap(ntry('<NtryDtls><TxDtls><Amt Ccy="CHF">1.00</Amt><AddtlTxInf>Info</AddtlTxInf><RmtInf><Ustrd>Beitrag</Ustrd></RmtInf></TxDtls></NtryDtls>')));
    expect(s.rows[0].rawText).toBe('Info Beitrag');
  });
  it('a single TxDtls without Amt uses the entry amount', () => {
    const s = parseCamt(wrap(ntry('<NtryDtls><TxDtls><AddtlTxInf>x</AddtlTxInf></TxDtls></NtryDtls>')));
    expect(s.rows.map(r => r.amount)).toEqual([20000]);
  });
});

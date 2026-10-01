import { normalizeQrReference } from '@okr/shared-util-core';

import { BankImportError, ParsedRow, ParsedStatement } from './types';

/** camt.053 (statement) / camt.054 (notification), any version; namespace-agnostic (spec 1.2 §4.1). */
export function matchesCamtHeader(lines: string[]): boolean {
  const head = lines.join(' ');
  return head.includes('<Document') && /urn:iso:std:iso:20022:tech:xsd:camt\.05[34]/.test(head);
}

const kids = (el: Element | undefined, name: string): Element[] =>
  el ? Array.from(el.children).filter(c => c.localName === name) : [];
const kid = (el: Element | undefined, name: string): Element | undefined => kids(el, name)[0];
/** Descend a child path, e.g. path(ntry, 'BookgDt', 'Dt'). */
const path = (el: Element | undefined, ...names: string[]): Element | undefined =>
  names.reduce<Element | undefined>((cur, n) => kid(cur, n), el);
const text = (el: Element | undefined): string => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

/** '120.00' | '80.5' | '50' → minor units, without float drift. */
function toMinor(value: string): number {
  const [int, frac = ''] = value.trim().split('.');
  return Number(int) * 100 + Number((frac + '00').substring(0, 2));
}
const storeDate = (iso: string): string => iso.substring(0, 10).replace(/-/g, '');

export function parseCamt(xml: string): ParsedStatement {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new BankImportError('unknown-format', 'camt: invalid XML');
  const root = doc.documentElement.firstElementChild ?? undefined;   // BkToCstmrStmt | BkToCstmrDbtCdtNtfctn
  const stmts = [...kids(root, 'Stmt'), ...kids(root, 'Ntfctn')];
  if (stmts.length === 0) throw new BankImportError('empty-file', 'camt');

  const first = stmts[0];
  const iban = text(path(first, 'Acct', 'Id', 'IBAN')).replace(/\s/g, '').toUpperCase();
  const currency = text(path(first, 'Acct', 'Ccy')) || 'CHF';
  const rows: ParsedRow[] = [];
  let lineNo = 0;

  for (const stmt of stmts) {
    for (const ntry of kids(stmt, 'Ntry')) {
      const date = storeDate(text(path(ntry, 'BookgDt', 'Dt')) || text(path(ntry, 'BookgDt', 'DtTm')) || text(path(ntry, 'ValDt', 'Dt')));
      const txs = kids(path(ntry, 'NtryDtls'), 'TxDtls');
      const parts = txs.length ? txs : [undefined];
      for (const tx of parts) {
        lineNo += 1;
        const amtEl = (tx && kid(tx, 'Amt')) || kid(ntry, 'Amt');
        const ind = text((tx && kid(tx, 'CdtDbtInd')) || kid(ntry, 'CdtDbtInd'));
        const minor = toMinor(text(amtEl));
        const credit = ind !== 'DBIT';
        const payee = text(path(tx, 'RltdPties', credit ? 'Dbtr' : 'Cdtr', 'Nm'))
          || text(path(tx, 'RltdPties', credit ? 'Dbtr' : 'Cdtr', 'Pty', 'Nm'));
        const info = text(path(tx, 'AddtlTxInf')) || text(path(tx, 'RmtInf', 'Ustrd')) || text(kid(ntry, 'AddtlNtryInf'));
        rows.push({
          date,
          rawText: [info, payee].filter(Boolean).join(' '),
          payee,
          amount: credit ? minor : -minor,
          currency: amtEl?.getAttribute('Ccy') || currency,
          bankReference: text(path(tx, 'Refs', 'AcctSvcrRef')) || text(kid(ntry, 'AcctSvcrRef')),
          paymentReference: normalizeQrReference(text(path(tx, 'RmtInf', 'Strd', 'CdtrRefInf', 'Ref'))),
          lineNo,
        });
      }
    }
  }

  return {
    format: 'camt', iban, currency, bankName: '',
    dateFrom: storeDate(text(path(first, 'FrToDt', 'FrDtTm'))),
    dateTo: storeDate(text(path(first, 'FrToDt', 'ToDtTm'))),
    rows, warnings: [], newestFirst: false,
  };
}

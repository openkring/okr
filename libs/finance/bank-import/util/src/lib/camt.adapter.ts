import { normalizeQrReference } from '@okr/shared-util-core';

import { BankImportError, ParsedRow, ParsedWarning, ParsedStatement } from './types';

/** camt.053 (statement) / camt.054 (notification), any version; namespace-agnostic (spec 1.2 §4.1). */
export function matchesCamtHeader(lines: string[]): boolean {
  const head = lines.join(' ');
  return /<(\w+:)?Document[\s>]/.test(head) && /urn:iso:std:iso:20022:tech:xsd:camt\.05[34]/.test(head);
}

const kids = (el: Element | undefined, name: string): Element[] =>
  el ? Array.from(el.children).filter(c => c.localName === name) : [];
const kid = (el: Element | undefined, name: string): Element | undefined => kids(el, name)[0];
/** Descend a child path, e.g. path(ntry, 'BookgDt', 'Dt'). */
const path = (el: Element | undefined, ...names: string[]): Element | undefined =>
  names.reduce<Element | undefined>((cur, n) => kid(cur, n), el);
const text = (el: Element | undefined): string => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

/** '120.00' | '80.5' | '50' → minor units, without float drift; undefined when not a plain decimal. */
function toMinor(value: string): number | undefined {
  const m = /^(\d+)(?:\.(\d*))?$/.exec(value.trim());
  if (!m) return undefined;
  return Number(m[1]) * 100 + Number(((m[2] ?? '') + '00').substring(0, 2));
}
const storeDate = (iso: string): string => iso.substring(0, 10).replace(/-/g, '');

/** Amount from AmtDtls: counter-value first, then the transaction/instructed amount if in the account currency, else whatever exists. */
function detailAmount(tx: Element, currency: string): Element | undefined {
  const cand = ['CntrValAmt', 'TxAmt', 'InstdAmt'].map(n => path(tx, 'AmtDtls', n, 'Amt'));
  return cand[0] ?? cand.find(a => a?.getAttribute('Ccy') === currency) ?? cand.find(Boolean);
}

export function parseCamt(xml: string): ParsedStatement {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new BankImportError('unknown-format', 'camt: invalid XML');
  const root = doc.documentElement.firstElementChild ?? undefined;   // BkToCstmrStmt | BkToCstmrDbtCdtNtfctn
  const stmts = [...kids(root, 'Stmt'), ...kids(root, 'Ntfctn')];
  if (stmts.length === 0) throw new BankImportError('empty-file', 'camt');

  const first = stmts[0];
  const last = stmts[stmts.length - 1];
  const ibanOf = (st: Element): string => text(path(st, 'Acct', 'Id', 'IBAN')).replace(/\s/g, '').toUpperCase();
  const iban = ibanOf(first);
  if (stmts.some(st => ibanOf(st) !== iban)) throw new BankImportError('unknown-format', 'camt: several accounts in one file');
  const currency = text(path(first, 'Acct', 'Ccy')) || 'CHF';
  const rows: ParsedRow[] = [];
  const warnings: ParsedWarning[] = [];
  let lineNo = 0;
  let ntryNo = 0;

  for (const stmt of stmts) {
    for (const ntry of kids(stmt, 'Ntry')) {
      ntryNo += 1;
      const ntryRef = text(kid(ntry, 'AcctSvcrRef')) || `camt Ntry ${ntryNo}`;
      const sts = kid(ntry, 'Sts');
      const status = text(kid(sts, 'Cd')) || text(sts);
      if (status && status !== 'BOOK') {
        warnings.push({ code: 'line-skipped', lineNo: lineNo + 1, detail: `${ntryRef} (${status})` });
        continue;
      }
      // CdtDbtInd of a reversal entry is its own direction and the encoding is unconfirmed: book manually.
      if (text(kid(ntry, 'RvslInd')) === 'true') {
        warnings.push({ code: 'line-skipped', lineNo: lineNo + 1, detail: `Storno ${ntryRef}` });
        continue;
      }
      const date = storeDate(text(path(ntry, 'BookgDt', 'Dt')) || text(path(ntry, 'BookgDt', 'DtTm')) || text(path(ntry, 'ValDt', 'Dt')));
      if (!/^\d{8}$/.test(date)) {
        warnings.push({ code: 'line-skipped', lineNo: lineNo + 1, detail: `${ntryRef} (no date)` });
        continue;
      }
      const txs = kids(ntry, 'NtryDtls').flatMap(d => kids(d, 'TxDtls'));
      const parts = txs.length ? txs : [undefined];
      for (const tx of parts) {
        lineNo += 1;
        const amtEl = (tx && (kid(tx, 'Amt') || detailAmount(tx, currency))) || (txs.length <= 1 ? kid(ntry, 'Amt') : undefined);
        const ind = text((tx && kid(tx, 'CdtDbtInd')) || kid(ntry, 'CdtDbtInd'));
        const minor = toMinor(text(amtEl));
        if (minor === undefined) {
          warnings.push({ code: 'line-skipped', lineNo, detail: ntryRef });
          continue;
        }
        const credit = ind !== 'DBIT';
        const payee = text(path(tx, 'RltdPties', credit ? 'Dbtr' : 'Cdtr', 'Nm'))
          || text(path(tx, 'RltdPties', credit ? 'Dbtr' : 'Cdtr', 'Pty', 'Nm'));
        const infos = [...new Set([text(path(tx, 'AddtlTxInf')), text(path(tx, 'RmtInf', 'Ustrd'))].filter(Boolean))];
        const info = infos.length ? infos.join(' ') : text(kid(ntry, 'AddtlNtryInf'));
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
    dateTo: storeDate(text(path(last, 'FrToDt', 'ToDtTm'))),
    rows, warnings, newestFirst: false,
  };
}

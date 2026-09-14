import { ParsedRow, ParsedWarning } from './types';

/**
 * Free correctness check when the file carries a running balance (spec §4.5). Newest-first files
 * (PostFinance, ZKB): saldo[i] === saldo[i+1] + amount[i]. Oldest-first: saldo[i+1] === saldo[i] + amount[i+1].
 * One warning per mismatching pair, naming the newer line; never blocks anything.
 */
export function checkSaldo(rows: ParsedRow[], newestFirst = true): ParsedWarning[] {
  const out: ParsedWarning[] = [];
  for (let i = 0; i + 1 < rows.length; i++) {
    const a = rows[i], b = rows[i + 1];
    if (a.saldo === undefined || b.saldo === undefined) continue;
    const expected = newestFirst ? b.saldo + a.amount : a.saldo + b.amount;
    const actual = newestFirst ? a.saldo : b.saldo;
    if (expected !== actual) out.push({ code: 'saldo-mismatch', lineNo: newestFirst ? a.lineNo : b.lineNo, detail: `${expected}/${actual}` });
  }
  return out;
}

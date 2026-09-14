import { BankFormat } from '@okr/shared-models';

import { splitLines, stripBom } from './csv.util';
import { matchesPostfinanceHeader, parsePostfinance } from './postfinance.adapter';
import { checkSaldo } from './saldo.util';
import { BankImportError, ParsedStatement } from './types';
import { matchesZkbHeader, parseZkb } from './zkb.adapter';

interface Adapter {
  matchesHeader(lines: string[]): boolean;
  parse(text: string): ParsedStatement;
  newestFirst: boolean;
}

const notImplemented = (format: BankFormat): Adapter => ({
  matchesHeader: () => false,
  parse: () => { throw new BankImportError('format-not-implemented', format); },
  newestFirst: true,
});

/** One entry per BankFormat. VZ and GKB are stubs until a real export exists (spec §4.7). */
const ADAPTERS: Record<BankFormat, Adapter> = {
  postfinance: { matchesHeader: matchesPostfinanceHeader, parse: parsePostfinance, newestFirst: true },
  zkb:         { matchesHeader: matchesZkbHeader, parse: parseZkb, newestFirst: true },
  vz:          notImplemented('vz'),
  gkb:         notImplemented('gkb'),
};

export function detectFormat(text: string): BankFormat | undefined {
  const lines = splitLines(stripBom(text ?? '')).slice(0, 20);
  return (Object.keys(ADAPTERS) as BankFormat[]).find(f => ADAPTERS[f].matchesHeader(lines));
}

export function parseStatement(text: string): ParsedStatement {
  const format = detectFormat(text);
  if (!format) throw new BankImportError('unknown-format', splitLines(stripBom(text ?? ''))[0]?.slice(0, 80) ?? '');
  const adapter = ADAPTERS[format];
  const statement = adapter.parse(text);
  statement.warnings.push(...checkSaldo(statement.rows, adapter.newestFirst));
  return statement;
}

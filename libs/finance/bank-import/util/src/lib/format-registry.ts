import { BankFormat } from '@okr/shared-models';

import { splitLines, stripBom } from './csv.util';
import { matchesGkbHeader, parseGkb } from './gkb.adapter';
import { matchesPostfinanceHeader, parsePostfinance } from './postfinance.adapter';
import { checkSaldo } from './saldo.util';
import { matchesSwissquoteHeader, parseSwissquote } from './swissquote.adapter';
import { BankImportError, ParsedStatement } from './types';
import { matchesVzHeader, parseVz } from './vz.adapter';
import { matchesYuhHeader, parseYuh } from './yuh.adapter';
import { matchesZkbHeader, parseZkb } from './zkb.adapter';

interface Adapter {
  matchesHeader(lines: string[]): boolean;
  parse(text: string): ParsedStatement;
  newestFirst: boolean;
}

/** One entry per BankFormat (spec §4). */
const ADAPTERS: Record<BankFormat, Adapter> = {
  postfinance: { matchesHeader: matchesPostfinanceHeader, parse: parsePostfinance, newestFirst: true },
  zkb:         { matchesHeader: matchesZkbHeader, parse: parseZkb, newestFirst: true },
  yuh:         { matchesHeader: matchesYuhHeader, parse: parseYuh, newestFirst: false },
  vz:          { matchesHeader: matchesVzHeader, parse: parseVz, newestFirst: true },
  gkb:         { matchesHeader: matchesGkbHeader, parse: parseGkb, newestFirst: true },
  swissquote:  { matchesHeader: matchesSwissquoteHeader, parse: parseSwissquote, newestFirst: false },
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
  statement.warnings.push(...checkSaldo(statement.rows, statement.newestFirst ?? adapter.newestFirst));
  return statement;
}

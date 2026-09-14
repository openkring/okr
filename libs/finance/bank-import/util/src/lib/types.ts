import { BankFormat } from '@okr/shared-models';

export type ParsedWarningCode = 'line-skipped' | 'saldo-mismatch' | 'iban-mismatch' | 'currency-mismatch' | 'rule-regex-invalid';

export interface ParsedWarning {
  code: ParsedWarningCode;
  lineNo: number;      // 1-based line in the file; 0 when not line-bound
  detail: string;      // free text appended to the translated message (e.g. the offending value)
}

export interface ParsedRow {
  date: string;                  // yyyymmdd
  rawText: string;               // whitespace-collapsed bank text
  payee: string;                 // '' when no pattern hit
  amount: number;                // signed minor units
  currency: string;
  amountFx?: { amount: number; currency: string };
  fxRate?: number;
  bankReference: string;         // '' for PostFinance and ZKB
  saldo?: number;                // minor units when the format has a saldo column
  lineNo: number;
}

export interface ParsedStatement {
  format: BankFormat;
  iban: string;                  // normalized
  currency: string;
  bankName: string;
  dateFrom: string;              // yyyymmdd or ''
  dateTo: string;
  rows: ParsedRow[];             // file order
  warnings: ParsedWarning[];
}

export type BankImportErrorCode = 'unknown-format' | 'no-iban' | 'format-not-implemented' | 'empty-file';

export class BankImportError extends Error {
  constructor(public readonly code: BankImportErrorCode, public readonly detail = '') {
    super(`${code}${detail ? ': ' + detail : ''}`);
    this.name = 'BankImportError';
  }
}

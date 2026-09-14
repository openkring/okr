import { normalizeText } from '@okr/finance-bank-rule-util';

export interface ImportKeyInput {
  iban: string;
  date: string;          // yyyymmdd
  amount: number;        // signed minor units
  bankReference: string;
  rawText: string;
}

/**
 * The pre-hash string per row (spec 1.60 §4.4). The occurrence index counts otherwise identical
 * rows in FILE ORDER, so a re-export of the same statement yields the same keys and three
 * identical `BEXIO AG 129.75` debits on one day stay three bookings.
 */
export function importKeyMaterial(rows: ImportKeyInput[]): string[] {
  const seen = new Map<string, number>();
  return rows.map(r => {
    const tuple = `${r.iban}|${r.date}|${r.amount}|${r.bankReference ?? ''}|${normalizeText(r.rawText)}`;
    const occurrence = seen.get(tuple) ?? 0;
    seen.set(tuple, occurrence + 1);
    return `${tuple}|${occurrence}`;
  });
}

export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function computeImportKeys(rows: ImportKeyInput[]): Promise<string[]> {
  return Promise.all(importKeyMaterial(rows).map(sha256Hex));
}

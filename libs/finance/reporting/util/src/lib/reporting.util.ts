import { BookingLineModel } from '@okr/shared-models';

export interface AccountBalanceEntry {
  accountKey: string;
  totalDebit: number;
  totalCredit: number;
  net: number;
}

export function aggregateAccountBalances(lines: BookingLineModel[]): AccountBalanceEntry[] {
  const map = new Map<string, { totalDebit: number; totalCredit: number }>();
  for (const line of lines) {
    const key = line.accountKey ?? '';
    if (!key) continue;
    const entry = map.get(key) ?? { totalDebit: 0, totalCredit: 0 };
    entry.totalDebit  += line.debitAmount?.amount  ?? 0;
    entry.totalCredit += line.creditAmount?.amount ?? 0;
    map.set(key, entry);
  }
  return Array.from(map.entries()).map(([accountKey, e]) => ({
    accountKey,
    totalDebit:  e.totalDebit,
    totalCredit: e.totalCredit,
    net: e.totalDebit - e.totalCredit,
  }));
}

export function exportToCsv(rows: AccountBalanceEntry[]): string {
  const header = 'accountKey,totalDebit,totalCredit,net';
  const body = rows.map(r => `${r.accountKey},${r.totalDebit},${r.totalCredit},${r.net}`).join('\n');
  return `${header}\n${body}`;
}

export function downloadCsv(csv: string, filename: string): void {
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), filename);
}

/** Hands a blob to the browser's downloader under `filename`. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Saves a generated document to the user's Downloads folder.
 *
 * NOT `window.open(url)`: the generated PDF lives behind a signed Storage URL that is only
 * handed to us several awaits after the context menu dismissed, so by then the browser no
 * longer counts the call as a user gesture and blocks the new tab without a word — the file
 * exists and the user never sees it. Fetching it into a blob and clicking a same-origin
 * `blob:` link is the path the CSV export already uses from this very menu.
 *
 * The bucket allows cross-origin GET (`cors.json`) and every app's CSP lists
 * `https://*.googleapis.com` under `connect-src`. Should the fetch fail anyway, the caller
 * still has the URL to fall back on — this returns false rather than throwing.
 */
export async function downloadFromUrl(url: string, filename: string): Promise<boolean> {
  try {
    const response = await fetch(url);
    if (!response.ok) return false;
    downloadBlob(await response.blob(), filename);
    return true;
  } catch {
    return false;
  }
}

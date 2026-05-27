import { BookingLineModel } from '@bk2/shared-models';

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
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

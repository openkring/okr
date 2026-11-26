#!/usr/bin/env node
/**
 * Guards spec 1.177 (ledger balances): no screen may stream the whole ledger again. A live listener on `bookings` or
 * `booking-lines` (`searchData(BookingCollection…` / `searchData(BookingLineCollection…`) must narrow its query by
 * date, booking key, document id or account — totals come from `ledger-balances` (LedgerBalanceStore), single
 * bookings from a period or by key (BookingService.listPage / listPeriod / listByKeys, BookingLineService.listForBookings).
 *
 * Scans libs/** and apps/functions/src/** (.ts, no specs). For each such call it looks at the call line and the 12 lines
 * above it (where the query is built) for a query key `key: 'date'` / `'bookingKey'` / `'__name__'` / `'accountKey'` / `'projectKey'` / `'costCenterKey'` (an orderBy does not count). A hit
 * without one fails unless the file is in ALLOWLIST.
 *
 * Limits (it is a text search, not a type check): a query built further away or passed in as a parameter is not seen
 * (then it fails — add the narrowing nearby or allowlist with a reason); one-shot whole-ledger reads
 * (`getDataOnce…`) are not checked; a narrowing key in a comment counts.
 *
 * Usage: node scripts/check-ledger-reads.mjs   (exit 1 on any finding)
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));

/** [file, reason] — remove an entry as soon as its reason is gone */
const ALLOWLIST = [
  ['libs/finance/reporting/data-access/src/lib/reporting.service.ts',
    'getJournalEntries / getAllLines: last callers are project-list and project-result (spec 1.177 R5, after the project-result branch)'],
];

const CALL = /searchData(<[^>]*>)?\(\s*(BookingCollection|BookingLineCollection|'bookings'|'booking-lines')/;
const NARROWING = /key:\s*'(date|bookingKey|__name__|accountKey|projectKey|costCenterKey)'/;
const LOOK_BACK = 12;

const files = execFileSync('git', ['ls-files', 'libs', 'apps/functions/src'], { encoding: 'utf8' })
  .split('\n').filter(f => f.endsWith('.ts') && !f.endsWith('.spec.ts'));
const allowed = new Set(ALLOWLIST.map(([f]) => f));

const findings = [];
for (const file of files) {
  if (allowed.has(file)) continue;
  let text;
  try { text = readFileSync(file, 'utf8'); } catch { continue; }
  if (!CALL.test(text)) continue;
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    if (!CALL.test(line)) return;
    const window = lines.slice(Math.max(0, i - LOOK_BACK), i + 1).join('\n');
    if (!NARROWING.test(window)) findings.push(`${file}:${i + 1}: ${line.trim()}`);
  });
}

if (findings.length) {
  console.error('check-ledger-reads: live listener on the whole ledger (spec 1.177) — narrow it by date, key or account,');
  console.error('or read totals from ledger-balances (LedgerBalanceStore):');
  for (const f of findings) console.error(`  ${f}`);
  process.exit(1);
}
console.log('check-ledger-reads: ok');

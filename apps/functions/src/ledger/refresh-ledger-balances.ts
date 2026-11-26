// apps/functions/src/ledger/refresh-ledger-balances.ts
//
// Recomputes the ledger balances of one set of books (spec 1.177 §6.2). Never increments: every year it touches is
// rebuilt from its bookings and lines, read in one read-only transaction, so periods, bookings, lines and the two
// counts come from the same snapshot. Locked years are reused while their locks stand; a count that does not match
// the stored documents rebuilds everything.

import { logger } from 'firebase-functions/v2';
import type { DocumentData, Firestore, Query, QueryDocumentSnapshot, Transaction } from 'firebase-admin/firestore';

import { LEDGER_BALANCE_VERSION, LedgerBalanceCollection, ledgerBalanceKey } from '@okr/shared-models';
import { buildLedgerYears, LedgerBooking, LedgerLine, LedgerYear } from '@okr/finance-reporting-util';

import { countTotals, isReusable, storeDateTimeInZurich, lockFingerprint, mayOverwrite, PeriodLike, sameFigures, StoredYear, yearsToRecompute } from './ledger-balance.util';

const BOOKINGS = 'bookings';
const LINES = 'booking-lines';
const PERIODS = 'periods';
/** `bookingKey in [...]`: Firestore allows 30 values. */
const IN_CHUNK = 30;
const PARALLEL = 10;

export interface RefreshBooks {
  accountingTenantId: string;
  /** the tenants of the books (accounting-configs/{id}.tenants): the same scope as the clients' queries */
  tenants: string[];
  fiscalYearStart: number;
}

export interface RefreshResult {
  accountingTenantId: string;
  computedAt: string;
  full: boolean;
  recomputed: number[];
  reused: number[];
  /** years whose stored figures were kept because a newer refresh had already written them */
  skipped: number[];
  /** locked years whose stored figures differed from the ledger (full refresh only) */
  changedLockedYears: number[];
  /** false when the counts still differ after a full rebuild (lines of an unknown booking, an undated booking without `date`) */
  countsMatch: boolean;
}

type Data = Record<string, unknown>;
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number => (typeof v === 'number' ? v : 0);

/** The same filter as the clients' finance queries: tenants + books + not archived. */
function scoped(db: Firestore, collection: string, books: RefreshBooks): Query {
  return db.collection(collection)
    .where('tenants', 'array-contains-any', books.tenants)
    .where('accountingTenantId', '==', books.accountingTenantId)
    .where('isArchived', '==', false);
}

function toBooking(d: QueryDocumentSnapshot<DocumentData>): LedgerBooking {
  const data = d.data() as Data;
  return { okey: d.id, date: str(data['date']), status: str(data['status']) as LedgerBooking['status'] };
}

function toLine(data: Data): LedgerLine {
  const amount = (v: unknown): { amount: number; currency: string } | undefined =>
    v && typeof v === 'object' ? { amount: num((v as Data)['amount']), currency: str((v as Data)['currency']) } : undefined;
  return {
    bookingKey: str(data['bookingKey']),
    accountKey: str(data['accountKey']),
    debitAmount: amount(data['debitAmount']),
    creditAmount: amount(data['creditAmount']),
    costCenterKey: str(data['costCenterKey']),
    projectKey: str(data['projectKey']),
  } as LedgerLine;
}

/** A line counts when it is in the clients' scope: not archived, of these books and tenants. */
function inScope(data: Data, books: RefreshBooks): boolean {
  const tenants = Array.isArray(data['tenants']) ? (data['tenants'] as unknown[]) : [];
  return data['isArchived'] !== true && data['accountingTenantId'] === books.accountingTenantId && tenants.some(t => books.tenants.includes(t as string));
}

/** Bookings of one calendar year (0 = undated, `date == ''`), index bookings (tenants, accountingTenantId, isArchived, date desc). */
async function bookingsOfYear(tx: Transaction, db: Firestore, books: RefreshBooks, year: number): Promise<LedgerBooking[]> {
  const base = scoped(db, BOOKINGS, books);
  const q = year === 0
    ? base.where('date', '==', '')
    : base.where('date', '>=', `${year}0101`).where('date', '<=', `${year}1231`).orderBy('date', 'desc');
  return (await tx.get(q)).docs.map(toBooking);
}

async function linesOfBookings(tx: Transaction, db: Firestore, books: RefreshBooks, keys: string[]): Promise<LedgerLine[]> {
  const chunks: string[][] = [];
  for (let i = 0; i < keys.length; i += IN_CHUNK) chunks.push(keys.slice(i, i + IN_CHUNK));
  const out: LedgerLine[] = [];
  for (let i = 0; i < chunks.length; i += PARALLEL) {
    const snaps = await Promise.all(chunks.slice(i, i + PARALLEL).map(c =>
      tx.get(db.collection(LINES).where('accountingTenantId', '==', books.accountingTenantId).where('bookingKey', 'in', c))));
    for (const snap of snaps) for (const d of snap.docs) if (inScope(d.data(), books)) out.push(toLine(d.data()));
  }
  return out;
}

async function readWholeLedger(tx: Transaction, db: Firestore, books: RefreshBooks): Promise<Map<number, LedgerYear>> {
  const [bookingSnap, lineSnap] = await Promise.all([tx.get(scoped(db, BOOKINGS, books)), tx.get(scoped(db, LINES, books))]);
  return buildLedgerYears(bookingSnap.docs.map(toBooking), lineSnap.docs.map(d => toLine(d.data())));
}

interface Snapshot {
  years: Map<number, LedgerYear>;
  reused: number[];
  full: boolean;
  countsMatch: boolean;
  periods: Map<string, PeriodLike>;
}

/** Everything read in one read-only transaction: one consistent snapshot of the books. */
async function readSnapshot(db: Firestore, books: RefreshBooks, stored: StoredYear[], full: boolean, currentYear: number): Promise<Snapshot> {
  return db.runTransaction(async tx => {
    const [periodSnap, bookingCount, lineCount] = await Promise.all([
      tx.get(db.collection(PERIODS).where('tenants', 'array-contains-any', books.tenants).where('accountingTenantId', '==', books.accountingTenantId)),
      tx.get(scoped(db, BOOKINGS, books).count()),
      tx.get(scoped(db, LINES, books).count()),
    ]);
    const periods = new Map<string, PeriodLike>(periodSnap.docs.map(d => [d.id, { okey: d.id, ...(d.data() as Omit<PeriodLike, 'okey'>) }]));
    const counts = { bookings: bookingCount.data().count, lines: lineCount.data().count };

    if (!full && stored.length > 0) {
      const reused = stored.filter(s => isReusable(s, lockFingerprint(books.accountingTenantId, s.year, books.fiscalYearStart, periods)));
      const reusedYears = new Set(reused.map(s => s.year));
      const years = new Map<number, LedgerYear>();
      for (const year of yearsToRecompute(stored, reusedYears, currentYear)) {
        const bookings = await bookingsOfYear(tx, db, books, year);
        const lines = await linesOfBookings(tx, db, books, bookings.map(b => b.okey));
        years.set(year, buildLedgerYears(bookings, lines).get(year) ?? { year, cells: [], bookingCounts: new Array(12).fill(0), bookingCount: 0, lineCount: 0 });
      }
      const totals = countTotals([...reused, ...years.values()]);
      if (totals.bookings === counts.bookings && totals.lines === counts.lines) {
        return { years, reused: [...reusedYears].sort((a, b) => a - b), full: false, countsMatch: true, periods };
      }
      logger.warn(`refreshLedgerBalances: ${books.accountingTenantId} counts differ (stored ${totals.bookings}/${totals.lines}, ledger ${counts.bookings}/${counts.lines}) — full rebuild`);
    }
    const years = await readWholeLedger(tx, db, books);
    const totals = countTotals([...years.values()]);
    return { years, reused: [], full: true, countsMatch: totals.bookings === counts.bookings && totals.lines === counts.lines, periods };
  }, { readOnly: true });
}

/** Recomputes the balances of one set of books and writes the changed years. `full` skips the reuse of locked years. */
export async function refreshLedgerBalances(db: Firestore, books: RefreshBooks, options: { full: boolean; now?: Date }): Promise<RefreshResult> {
  const now = options.now ?? new Date();
  // wall-clock time in Zurich: the app shows it as «Stand», and functions run in UTC
  const computedAt = storeDateTimeInZurich(now);
  const currentYear = Number(computedAt.slice(0, 4));
  const col = db.collection(LedgerBalanceCollection);
  const storedSnap = await col.where('tenants', 'array-contains-any', books.tenants).where('accountingTenantId', '==', books.accountingTenantId).get();
  const stored = new Map<number, StoredYear & { computedAt?: string }>(storedSnap.docs.map(d => [num(d.data()['year']), d.data() as StoredYear]));

  const snap = await readSnapshot(db, books, [...stored.values()], options.full, currentYear);
  if (!snap.countsMatch) {
    logger.error(`refreshLedgerBalances: ${books.accountingTenantId} counts still differ after a full rebuild — lines of an unknown booking or a booking without a date field`);
  }

  const changedLockedYears: number[] = [];
  const docs: { year: number; data: Data }[] = [];
  for (const y of snap.years.values()) {
    const locks = lockFingerprint(books.accountingTenantId, y.year, books.fiscalYearStart, snap.periods);
    const before = stored.get(y.year);
    if (snap.full && before && locks && before.locks === locks && !sameFigures(before, y)) changedLockedYears.push(y.year);
    // an empty year is written only over an existing document (it lost its last booking)
    if (y.bookingCount === 0 && !before) continue;
    docs.push({ year: y.year, data: {
      tenants: books.tenants, isArchived: false, accountingTenantId: books.accountingTenantId, year: y.year,
      cells: y.cells, bookingCounts: y.bookingCounts, bookingCount: y.bookingCount, lineCount: y.lineCount,
      locks, computedAt, version: LEDGER_BALANCE_VERSION,
    } });
  }
  // a full rebuild knows every year: a stored year without bookings is removed
  const removed = snap.full ? [...stored.keys()].filter(year => !snap.years.has(year)) : [];
  if (changedLockedYears.length) {
    logger.error(`refreshLedgerBalances: ${books.accountingTenantId} locked years changed since their last computation: ${changedLockedYears.join(', ')}`);
  }

  const skipped = await db.runTransaction(async tx => {
    const refs = [...docs.map(d => col.doc(ledgerBalanceKey(books.accountingTenantId, d.year))), ...removed.map(y => col.doc(ledgerBalanceKey(books.accountingTenantId, y)))];
    const current = refs.length ? await tx.getAll(...refs) : [];
    const newer = new Set(current.filter(s => s.exists && !mayOverwrite(str(s.data()?.['computedAt']), computedAt)).map(s => s.id));
    const out: number[] = [];
    for (const d of docs) {
      const ref = col.doc(ledgerBalanceKey(books.accountingTenantId, d.year));
      if (newer.has(ref.id)) { out.push(d.year); continue; }
      tx.set(ref, d.data);
    }
    for (const year of removed) {
      const ref = col.doc(ledgerBalanceKey(books.accountingTenantId, year));
      if (!newer.has(ref.id)) tx.delete(ref);
    }
    return out;
  });

  const result: RefreshResult = {
    accountingTenantId: books.accountingTenantId, computedAt, full: snap.full,
    recomputed: [...snap.years.keys()].sort((a, b) => a - b), reused: snap.reused, skipped, changedLockedYears, countsMatch: snap.countsMatch,
  };
  logger.info(`refreshLedgerBalances: ${books.accountingTenantId} full=${result.full} recomputed=${result.recomputed.join(',')} reused=${result.reused.join(',')} skipped=${skipped.join(',')}`);
  return result;
}

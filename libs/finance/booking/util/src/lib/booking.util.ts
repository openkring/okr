import { AccountModel, AvatarInfo, BookingLineModel, BookingModel, MoneyModel } from '@okr/shared-models';
import { convertDateFormatToString, DateFormat, isProfitAndLossAccountId } from '@okr/shared-util-core';

/**
 * One part of a split booking, as shown when the journal row is expanded: a Soll account against a
 * Haben account for one amount (`linesToPairs`), so the shared bank line is not listed on its own.
 * `text` is the part's own text ('' when it has none), `amount` is formatted.
 */
export interface JournalPart {
  okey: string;           // position within the booking ('0', '1', …) — stable for one line set
  debitAccountId: string;
  debitAccountName: string;
  creditAccountId: string;
  creditAccountName: string;
  text: string;
  amount: string;
}

/**
 * A single flattened row of the journal list view: normally one booking. In a journal filtered on
 * one account, a split booking yields one row per line on that account instead (`lineKey` set).
 */
export interface JournalRow {
  booking: BookingModel;
  okey: string;           // unique row id: the booking okey, or `<booking>#<line>` for a line row
  lineKey: string;        // the line this row stands for; '' for a whole-booking row
  date: string;           // booking date formatted as dd.mm.yyyy
  year: number;           // booking year (from the yyyymmdd StoreDate)
  creditAccount: string;  // account id(s) of the credit line(s), comma-joined
  debitAccount: string;   // account id(s) of the debit line(s), comma-joined
  creditAccountName: string;  // account name(s) of the credit line(s), comma-joined ('' when unknown)
  debitAccountName: string;
  accountName: string;    // booking title / description text
  amount: string;         // balanced booking total, formatted (e.g. 1'234.50)
  currency: string;
  parts: JournalPart[];   // the lines of a split booking (expandable in the list); [] for a plain one
}

/**
 * A split booking has more lines than one debit against one credit — e.g. one bank line against
 * several counter-accounts, or a bank + fee line. Its journal row can be expanded to its lines.
 */
export function isSplitBooking(lines: BookingLineModel[]): boolean {
  return lines.length > 2;
}

/** Main name of a split booking: 'Sammelbuchung · Migros', or just the base name without a party. */
export function splitBookingTitle(baseName: string, party = ''): string {
  const p = party.trim();
  return p ? `${baseName} · ${p}` : baseName;
}

/** True when the title is (still) the generated main name of a split booking. */
export function isSplitBookingTitle(title: string, baseName: string): boolean {
  const t = (title ?? '').trim();
  return !!baseName && (t === baseName || t.startsWith(`${baseName} · `));
}

function lineAmount(line: BookingLineModel): number {
  return line.debitAmount?.amount ?? line.creditAmount?.amount ?? 0;
}

function toJournalParts(lines: BookingLineModel[], accountIdByKey: Map<string, string>, accountNameByKey: Map<string, string>): JournalPart[] {
  return linesToPairs(lines).map((p, i) => ({
    okey: String(i),
    debitAccountId: accountIdByKey.get(p.debitAccountKey) ?? '',
    debitAccountName: accountNameByKey.get(p.debitAccountKey) ?? '',
    creditAccountId: accountIdByKey.get(p.creditAccountKey) ?? '',
    creditAccountName: accountNameByKey.get(p.creditAccountKey) ?? '',
    text: p.description,
    amount: formatMinorAmount(p.amount),
  }));
}

/**
 * The distinct accounts on one side of a booking, in line order: one for a plain booking, several
 * on the parts' side of a split booking ("Haben-Konto anzeigen" then asks which one).
 */
export function sideAccountKeys(lines: BookingLineModel[], side: 'debit' | 'credit'): string[] {
  const keys = lines.filter(l => (side === 'debit' ? l.debitAmount : l.creditAmount) && l.accountKey).map(l => l.accountKey);
  return [...new Set(keys)];
}

/** Display name of a counterparty ('' when none). */
export function counterpartyLabel(counterparty: AvatarInfo | undefined): string {
  return counterparty ? (counterparty.label || `${counterparty.name1 ?? ''} ${counterparty.name2 ?? ''}`.trim()) : '';
}

/** Extract the four-digit year from a booking's yyyymmdd StoreDate (0 if unset). */
export function bookingYear(booking: BookingModel): number {
  const d = booking.date ?? '';
  return d.length >= 4 ? Number(d.substring(0, 4)) : 0;
}

/** Extract the month (1-12) from a booking's yyyymmdd StoreDate (0 if unset). */
export function bookingMonth(booking: BookingModel): number {
  const d = booking.date ?? '';
  return d.length >= 6 ? Number(d.substring(4, 6)) : 0;
}

/** Format a minor-unit amount (e.g. Rappen) as a Swiss-formatted major-unit string. */
export function formatMinorAmount(minor: number): string {
  return (minor / 100).toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Build a flattened journal row for a booking and its lines.
 * creditAccount / debitAccount hold the account id(s) (resolved via accountIdByKey);
 * amount is the balanced total (Σ creditAmount == Σ debitAmount for a valid booking).
 */
export function toJournalRow(
  booking: BookingModel,
  lines: BookingLineModel[],
  accountIdByKey: Map<string, string>,
  accountNameByKey: Map<string, string> = new Map(),
): JournalRow {
  const creditIds = new Set<string>();
  const debitIds = new Set<string>();
  const creditNames = new Set<string>();
  const debitNames = new Set<string>();
  let total = 0;
  let currency = 'CHF';
  for (const line of lines) {
    const id = accountIdByKey.get(line.accountKey) ?? '';
    const name = accountNameByKey.get(line.accountKey) ?? '';
    if (line.creditAmount) {
      if (id) creditIds.add(id);
      if (name) creditNames.add(name);
      total += line.creditAmount.amount;
      currency = line.creditAmount.currency;
    }
    if (line.debitAmount) {
      if (id) debitIds.add(id);
      if (name) debitNames.add(name);
      currency = line.debitAmount.currency;
    }
  }
  return {
    booking,
    okey: booking.okey,
    lineKey: '',
    date: booking.date ? convertDateFormatToString(booking.date, DateFormat.StoreDate, DateFormat.ViewDate, false) : '',
    year: bookingYear(booking),
    creditAccount: [...creditIds].join(', '),
    debitAccount: [...debitIds].join(', '),
    creditAccountName: [...creditNames].join(', '),
    debitAccountName: [...debitNames].join(', '),
    accountName: booking.title,
    amount: formatMinorAmount(total),
    currency,
    parts: isSplitBooking(lines) ? toJournalParts(lines, accountIdByKey, accountNameByKey) : [],
  };
}

/**
 * The journal rows of one booking in a journal filtered on `accountKey`. A plain booking stays one
 * row. A split booking shows only its lines on that account, one row each, with the line's own
 * amount and text (the booking's title when the line has none); the other column lists the
 * counter-side accounts. Returns [] when the booking has no line on the account.
 */
export function toAccountJournalRows(
  booking: BookingModel,
  lines: BookingLineModel[],
  accountKey: string,
  accountIdByKey: Map<string, string>,
  accountNameByKey: Map<string, string> = new Map(),
): JournalRow[] {
  const own = lines.filter(l => l.accountKey === accountKey);
  if (own.length === 0) return [];
  const row = toJournalRow(booking, lines, accountIdByKey, accountNameByKey);
  if (!isSplitBooking(lines)) return [row];
  return own.map(line => {
    const side = line.debitAmount ? 'debit' : 'credit';
    const others = lines.filter(l => (side === 'debit' ? !!l.creditAmount : !!l.debitAmount));
    const ids = (ls: BookingLineModel[]) => [...new Set(ls.map(l => accountIdByKey.get(l.accountKey) ?? '').filter(Boolean))].join(', ');
    const names = (ls: BookingLineModel[]) => [...new Set(ls.map(l => accountNameByKey.get(l.accountKey) ?? '').filter(Boolean))].join(', ');
    return {
      ...row,
      okey: `${booking.okey}#${line.okey}`,
      lineKey: line.okey,
      debitAccount: side === 'debit' ? ids([line]) : ids(others),
      debitAccountName: side === 'debit' ? names([line]) : names(others),
      creditAccount: side === 'credit' ? ids([line]) : ids(others),
      creditAccountName: side === 'credit' ? names([line]) : names(others),
      accountName: (line.description ?? '').trim() || booking.title,
      amount: formatMinorAmount(lineAmount(line)),
      currency: (line.debitAmount ?? line.creditAmount)?.currency ?? row.currency,
      parts: [],
    };
  });
}

/** Case-insensitive match of a journal row against a free-text search term. */
export function matchesJournalSearch(row: JournalRow, term: string): boolean {
  const t = term.trim().toLowerCase();
  if (!t) return true;
  return (
    row.accountName.toLowerCase().includes(t) ||
    row.parts.some(p => p.text.toLowerCase().includes(t)) ||
    row.creditAccount.toLowerCase().includes(t) ||
    row.debitAccount.toLowerCase().includes(t) ||
    row.date.includes(t) ||
    row.amount.includes(t) ||
    String(row.booking.bookingNo).includes(t)
  );
}

/** Flatten journal rows to a 2D string array (with header) for CSV export. */
export function journalToRows(
  rows: JournalRow[],
  headers: { date: string; credit: string; debit: string; name: string; amount: string },
): string[][] {
  return [
    [headers.date, headers.credit, headers.debit, headers.name, headers.amount],
    ...rows.map(r => [r.date, r.creditAccount, r.debitAccount, r.accountName, r.amount]),
  ];
}

export function validateBookingBalance(lines: BookingLineModel[]): boolean {
  let debitTotal = 0;
  let creditTotal = 0;
  for (const line of lines) {
    debitTotal  += line.debitAmount?.amount  ?? 0;
    creditTotal += line.creditAmount?.amount ?? 0;
  }
  return debitTotal === creditTotal;
}

export function generateBookingNo(year: number, sequence: number): string {
  return `${year}-${String(sequence).padStart(6, '0')}`;
}

/*-------------------------- edit form: pairs <-> lines --------------------------------*/

/**
 * One row of the booking form: a debit account against a credit account for one amount — the way
 * a treasurer thinks of a booking (Soll / Haben / Betrag). Amounts are minor units. `amountFx` and
 * `vatCodeKey` sit behind the row's detail toggle; `amountFx = 0` means none.
 */
export interface BookingPair {
  debitAccountKey: string;
  creditAccountKey: string;
  debitCostCenterKey: string;    // Kostenstelle of the debit line ('' = none / account default)
  creditCostCenterKey: string;
  amount: number;
  amountFx: number;
  fxCurrency: string;
  vatCodeKey: string;
  vatSide: 'debit' | 'credit';   // which line carries the VAT code (expense → debit, revenue → credit)
  description: string;           // line text (e.g. one part of a split bank booking); '' = the booking's title
  descriptionSide: 'debit' | 'credit';   // which line carries the text (the part's side of a split)
}

/** Cap of a line text; `writeBooking` truncates at the same length. */
export const BOOKING_LINE_TEXT_LENGTH = 200;

export interface BookingFormData {
  okey: string;
  title: string;
  date: string;              // StoreDate yyyymmdd
  notes: string;
  counterparty: AvatarInfo | undefined;
  pairs: BookingPair[];
}

export function emptyBookingPair(): BookingPair {
  return { debitAccountKey: '', creditAccountKey: '', debitCostCenterKey: '', creditCostCenterKey: '', amount: 0, amountFx: 0, fxCurrency: 'EUR', vatCodeKey: '', vatSide: 'debit', description: '', descriptionSide: 'debit' };
}

/**
 * Split the stored lines into debit/credit pairs (greedy: the smaller open amount of the two heads
 * closes a pair). A two-line booking is exactly one pair; a split booking (one debit, several
 * credits) is one pair per credit. An unbalanced booking leaves a pair with one empty account,
 * which the form flags. FX and VAT are carried onto the pair when both lines agree or only one
 * side has them. A line's `description` goes onto every pair that takes (part of) that line, so
 * `pairsToLines` merges the pieces back into the one line by (account, text).
 */
export function linesToPairs(lines: BookingLineModel[]): BookingPair[] {
  type Open = { accountKey: string; left: number; amountFx: number; fxCurrency: string; vatCodeKey: string; description: string; total: number; costCenterKey: string };
  const open = (l: BookingLineModel, m: MoneyModel): Open => ({
    accountKey: l.accountKey, left: m.amount, total: m.amount,
    amountFx: l.amountFx?.amount ?? 0, fxCurrency: l.amountFx?.currency ?? 'EUR', vatCodeKey: l.vatCodeKey ?? '', description: l.description ?? '', costCenterKey: l.costCenterKey ?? '',
  });
  const debits = lines.filter(l => l.debitAmount && l.debitAmount.amount > 0).map(l => open(l, l.debitAmount as MoneyModel));
  const credits = lines.filter(l => l.creditAmount && l.creditAmount.amount > 0).map(l => open(l, l.creditAmount as MoneyModel));
  const pairs: BookingPair[] = [];
  while (debits.length && credits.length) {
    const d = debits[0], c = credits[0];
    const amount = Math.min(d.left, c.left);
    // fx only when the pair takes a line whole (otherwise the fx split is unknown)
    const fxSource = d.left === d.total && amount === d.total && d.amountFx ? d : (c.left === c.total && amount === c.total && c.amountFx ? c : undefined);
    const textFromDebit = !!d.description;
    const description = d.description || c.description;
    pairs.push({ debitAccountKey: d.accountKey, creditAccountKey: c.accountKey, debitCostCenterKey: d.costCenterKey, creditCostCenterKey: c.costCenterKey, amount,
      amountFx: fxSource?.amountFx ?? 0, fxCurrency: fxSource?.fxCurrency ?? 'EUR',
      vatCodeKey: d.vatCodeKey || c.vatCodeKey, vatSide: d.vatCodeKey || !c.vatCodeKey ? 'debit' : 'credit',
      description, descriptionSide: textFromDebit || !description ? 'debit' : 'credit' });
    d.left -= amount; c.left -= amount;
    if (d.left === 0) debits.shift();
    if (c.left === 0) credits.shift();
  }
  for (const d of debits) pairs.push({ debitAccountKey: d.accountKey, creditAccountKey: '', debitCostCenterKey: d.costCenterKey, creditCostCenterKey: '', amount: d.left, amountFx: 0, fxCurrency: 'EUR', vatCodeKey: d.vatCodeKey, vatSide: 'debit', description: d.description, descriptionSide: 'debit' });
  for (const c of credits) pairs.push({ debitAccountKey: '', creditAccountKey: c.accountKey, debitCostCenterKey: '', creditCostCenterKey: c.costCenterKey, amount: c.left, amountFx: 0, fxCurrency: 'EUR', vatCodeKey: c.vatCodeKey, vatSide: 'credit', description: c.description, descriptionSide: 'credit' });
  return pairs;
}

/**
 * Which line carries a pair's text. In a split every part shares one account on one side (the bank
 * line); a text put there would cut that line in pieces, so it moves to the part's own side.
 */
function textSideOf(p: BookingPair, pairs: BookingPair[]): 'debit' | 'credit' {
  const shared = (side: 'debit' | 'credit'): boolean => {
    const key = side === 'debit' ? p.debitAccountKey : p.creditAccountKey;
    return pairs.length > 1 && !!key && pairs.every(q => (side === 'debit' ? q.debitAccountKey : q.creditAccountKey) === key);
  };
  if (p.descriptionSide === 'debit' && shared('debit') && !shared('credit')) return 'credit';
  if (p.descriptionSide === 'credit' && shared('credit') && !shared('debit')) return 'debit';
  return p.descriptionSide;
}

/**
 * Turn the form's pairs back into lines, one per (account, side, text): amounts of the same account on
 * the same side are merged, so a booking round-trips to its compact line set. A pair's text goes onto
 * its `descriptionSide` line; two parts with different texts on the same account stay two lines.
 * Debit lines first.
 */
export function pairsToLines(pairs: BookingPair[], tenantId: string, accountingTenantId: string, bookingKey: string, currency = 'CHF'): BookingLineModel[] {
  type Acc = { accountKey: string; amount: number; amountFx: number; fxCurrency: string; vatCodeKey: string; description: string; costCenterKey: string };
  const merge = (map: Map<string, Acc>, key: string, p: BookingPair, vatCodeKey: string, description: string, costCenterKey: string): void => {
    if (!key) return;
    const id = `${key}\u0000${description}\u0000${costCenterKey}`;
    const acc = map.get(id) ?? { accountKey: key, amount: 0, amountFx: 0, fxCurrency: p.fxCurrency, vatCodeKey: '', description, costCenterKey };
    acc.amount += p.amount;
    acc.amountFx += p.amountFx;
    if (!acc.vatCodeKey && vatCodeKey) acc.vatCodeKey = vatCodeKey;
    map.set(id, acc);
  };
  const debits = new Map<string, Acc>(), credits = new Map<string, Acc>();
  for (const p of pairs) {
    const text = (p.description ?? '').trim();
    const textOnCredit = textSideOf(p, pairs) === 'credit';
    merge(debits, p.debitAccountKey, p, p.vatSide === 'credit' ? '' : p.vatCodeKey, textOnCredit ? '' : text, p.debitCostCenterKey ?? '');
    merge(credits, p.creditAccountKey, p, p.vatSide === 'credit' ? p.vatCodeKey : '', textOnCredit ? text : '', p.creditCostCenterKey ?? '');
  }
  const toLine = (acc: Acc, side: 'debit' | 'credit'): BookingLineModel => {
    const line = new BookingLineModel(tenantId, accountingTenantId);
    line.bookingKey = bookingKey;
    line.accountKey = acc.accountKey;
    const money = new MoneyModel(acc.amount, currency as MoneyModel['currency']);
    if (side === 'debit') line.debitAmount = money; else line.creditAmount = money;
    line.amountFx = acc.amountFx > 0 ? new MoneyModel(acc.amountFx, acc.fxCurrency as MoneyModel['currency']) : undefined;
    line.vatCodeKey = acc.vatCodeKey;
    line.description = acc.description;
    line.costCenterKey = acc.costCenterKey;
    return line;
  };
  return [
    ...[...debits.values()].map(a => toLine(a, 'debit')),
    ...[...credits.values()].map(a => toLine(a, 'credit')),
  ];
}

/**
 * Set a pair side's account and keep its Kostenstelle consistent (spec 1.65 §6.2): a P&L account
 * with a default prefills it, a balance-sheet account clears it, otherwise the chosen key stays.
 */
export function withPairAccount(pair: BookingPair, side: 'debit' | 'credit', accountKey: string, accounts: AccountModel[]): BookingPair {
  const account = accounts.find(a => a.okey === accountKey);
  const current = (side === 'debit' ? pair.debitCostCenterKey : pair.creditCostCenterKey) ?? '';
  const next = !isProfitAndLossAccountId(account?.id) ? '' : (account?.costCenterKey || current);
  return side === 'debit'
    ? { ...pair, debitAccountKey: accountKey, debitCostCenterKey: next }
    : { ...pair, creditAccountKey: accountKey, creditCostCenterKey: next };
}

export function toBookingFormData(booking: BookingModel, lines: BookingLineModel[]): BookingFormData {
  const pairs = linesToPairs(lines);
  return { okey: booking.okey, title: booking.title, date: booking.date, notes: booking.notes ?? '', counterparty: booking.counterparty,
    pairs: pairs.length ? pairs : [emptyBookingPair()] };
}

/**
 * "Zeile hinzufügen" on a booking that is not split yet: the booking's text moves onto the first
 * part (unless that part already has its own) and the booking gets the split main name
 * (`splitBookingTitle`). Further rows only append an empty pair.
 */
export function addBookingPart(data: BookingFormData, splitBaseName: string): BookingFormData {
  return withSplitTitle({ ...data, pairs: [...data.pairs, emptyBookingPair()] }, splitBaseName);
}

/**
 * A split booking (more than one part) is always named 'Sammelbuchung · <Gegenpartei>' — the name
 * is not typed but follows the counterparty. A text that is not such a name yet moves onto the first
 * part, unless a part already has its own text. A booking with one part is returned unchanged.
 */
export function withSplitTitle(data: BookingFormData, splitBaseName: string): BookingFormData {
  if (data.pairs.length < 2 || !splitBaseName) return data;   // '' while the i18n bundle is still loading
  const title = splitBookingTitle(splitBaseName, counterpartyLabel(data.counterparty));
  const old = (data.title ?? '').trim();
  const hasPartText = data.pairs.some(p => (p.description ?? '').trim());
  if (!old || isSplitBookingTitle(old, splitBaseName) || hasPartText) {
    return title === data.title ? data : { ...data, title };
  }
  return { ...data, title, pairs: data.pairs.map((p, i) => i === 0 ? { ...p, description: old } : p) };
}

/**
 * "Zeile entfernen": when only one part is left and the title is still the generated main name,
 * the part's text becomes the booking's text again — the reverse of `addBookingPart`.
 */
export function removeBookingPart(data: BookingFormData, index: number, splitBaseName: string): BookingFormData {
  const pairs = data.pairs.filter((_, i) => i !== index);
  if (pairs.length !== 1 || !isSplitBookingTitle(data.title, splitBaseName)) return { ...data, pairs };
  const text = (pairs[0].description ?? '').trim();
  if (!text) return { ...data, pairs };
  return { ...data, title: text, pairs: [{ ...pairs[0], description: '' }] };
}

/** Σ pair amounts in minor units — the booking total shown while editing. */
export function pairsTotal(pairs: BookingPair[]): number {
  return pairs.reduce((sum, p) => sum + (p.amount || 0), 0);
}

/**
 * "Buchung kopieren": a fresh, unsaved booking with the same text, counterparty and lines, dated
 * today. Everything that belongs to the original stays behind — its key and booking number, the
 * voucher (`documentKey`) and period, the review status, and — because they hang on the original's
 * key — its Belege and comments. The copy starts as a `draft`; the `writeBooking` CF assigns the
 * booking number when it is saved.
 */
export function copyBooking(
  booking: BookingModel,
  lines: BookingLineModel[],
  date: string,
): { booking: BookingModel; lines: BookingLineModel[] } {
  const tenantId = booking.tenants[0] ?? '';
  const copy = new BookingModel(tenantId, booking.accountingTenantId);
  copy.title = booking.title;
  copy.date = date;
  copy.notes = booking.notes ?? '';
  copy.tags = booking.tags ?? '';
  copy.counterparty = booking.counterparty;
  return {
    booking: copy,
    lines: lines.map(line => {
      const copiedLine = new BookingLineModel(tenantId, booking.accountingTenantId);
      copiedLine.accountKey = line.accountKey;
      copiedLine.debitAmount = line.debitAmount;
      copiedLine.creditAmount = line.creditAmount;
      copiedLine.amountFx = line.amountFx;
      copiedLine.exchangeRateKey = line.exchangeRateKey;
      copiedLine.vatCodeKey = line.vatCodeKey;
      return copiedLine;
    }),
  };
}

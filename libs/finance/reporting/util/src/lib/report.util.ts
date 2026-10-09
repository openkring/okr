import { AccountModel, BookingLineModel, BookingModel } from '@okr/shared-models';

/**
 * Bilanz / Erfolgsrechnung building blocks (pure, tested). Amounts are minor units (Rappen).
 * Classification follows the Swiss KMU Kontenrahmen: the first digit of the account number decides
 * the class — 1 Aktiven, 2 Passiven, 3 Ertrag, 4–6 Aufwand, 7–9 betrieblicher/ausserordentlicher
 * Erfolg und Abschluss. Booking lines carry no date, so every aggregation joins a line to its
 * posted booking first.
 */
export type AccountClass = 'assets' | 'liabilities' | 'revenue' | 'expense' | 'result' | 'other';

export function accountClass(id: string): AccountClass {
  switch ((id ?? '').trim().charAt(0)) {
    case '1': return 'assets';
    case '2': return 'liabilities';
    case '3': return 'revenue';
    case '4': case '5': case '6': return 'expense';
    case '7': case '8': case '9': return 'result';
    default: return 'other';
  }
}

export interface FiscalYear {
  year: number;      // the year the fiscal year starts in
  from: string;      // StoreDate yyyymmdd, inclusive
  to: string;        // StoreDate yyyymmdd, inclusive
  label: string;     // '2025' or '2025/26'
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();   // day 0 of the next month
}
function pad2(n: number): string { return String(n).padStart(2, '0'); }

/** The fiscal year `year` of a tenant whose fiscal year starts in `startMonth` (1–12). */
export function fiscalYear(year: number, startMonth: number): FiscalYear {
  const start = startMonth >= 1 && startMonth <= 12 ? startMonth : 1;
  if (start === 1) {
    return { year, from: `${year}0101`, to: `${year}1231`, label: String(year) };
  }
  const endYear = year + 1;
  const endMonth = start - 1;
  return {
    year,
    from: `${year}${pad2(start)}01`,
    to: `${endYear}${pad2(endMonth)}${pad2(lastDayOfMonth(endYear, endMonth))}`,
    label: `${year}/${String(endYear).slice(-2)}`,
  };
}

/** Fiscal year a StoreDate belongs to; 0 for an unusable date. */
export function fiscalYearOf(date: string, startMonth: number): number {
  if (!date || date.length < 6) return 0;
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(4, 6));
  if (!year || !month) return 0;
  const start = startMonth >= 1 && startMonth <= 12 ? startMonth : 1;
  return month >= start ? year : year - 1;
}

export interface DebitCredit { debit: number; credit: number }

/**
 * Debit/credit per account okey over the lines whose booking is in `bookings` (pass posted bookings
 * only) and dated within [from, to]. An empty `from` means "since the beginning" (balance sheet).
 */
export function sumLinesByAccount(lines: BookingLineModel[], bookings: BookingModel[], from: string, to: string): Map<string, DebitCredit> {
  const dateByBooking = new Map<string, string>();
  for (const b of bookings) {
    if (b.status === 'posted') dateByBooking.set(b.okey, b.date ?? '');
  }
  const out = new Map<string, DebitCredit>();
  for (const line of lines) {
    const date = dateByBooking.get(line.bookingKey);
    if (date === undefined) continue;
    if ((from && date < from) || (to && date > to)) continue;
    const key = line.accountKey ?? '';
    if (!key) continue;
    const entry = out.get(key) ?? { debit: 0, credit: 0 };
    entry.debit += line.debitAmount?.amount ?? 0;
    entry.credit += line.creditAmount?.amount ?? 0;
    out.set(key, entry);
  }
  return out;
}

/** Aktiven and Aufwand are shown debit-positive, Passiven, Ertrag and Erfolg credit-positive. */
export function signedBalance(cls: AccountClass, dc: DebitCredit | undefined): number {
  const debit = dc?.debit ?? 0;
  const credit = dc?.credit ?? 0;
  return cls === 'assets' || cls === 'expense' ? debit - credit : credit - debit;
}

export type ReportRowKind = 'group' | 'account' | 'total' | 'result';

export interface ReportRow {
  okey: string;
  id: string;
  name: string;
  depth: number;
  kind: ReportRowKind;
  hasChildren: boolean;
  isExpanded: boolean;
  current: number;
  previous: number;
}

interface Node { account: AccountModel; children: Node[]; cls: AccountClass }

function byId(a: AccountModel, b: AccountModel): number {
  return (a.id ?? '').localeCompare(b.id ?? '', 'de', { numeric: true }) || (a.name ?? '').localeCompare(b.name ?? '', 'de');
}

/**
 * The class-level forest of a tenant's chart(s): every live account whose parent is absent or
 * carries no classifiable number is a top-level node; its class is inherited by the whole subtree,
 * so a leaf's sign never contradicts the section it is printed in.
 */
function buildForest(accounts: AccountModel[]): Node[] {
  const live = accounts.filter(a => !a.isArchived);
  const byKey = new Map(live.map(a => [a.okey, a]));
  const childrenOf = new Map<string, AccountModel[]>();
  for (const a of live) {
    const list = childrenOf.get(a.parentKey ?? '') ?? [];
    list.push(a);
    childrenOf.set(a.parentKey ?? '', list);
  }
  const toNode = (account: AccountModel, cls: AccountClass): Node => ({
    account, cls,
    children: (childrenOf.get(account.okey) ?? []).sort(byId).map(c => toNode(c, cls)),
  });
  const isTopLevel = (a: AccountModel): boolean => {
    const parent = byKey.get(a.parentKey ?? '');
    return !parent || accountClass(parent.id) === 'other';
  };
  // a chart root (no number) is not a report node itself — its classified children are the top level
  return live.filter(a => isTopLevel(a) && accountClass(a.id) !== 'other').sort(byId).map(a => toNode(a, accountClass(a.id)));
}

function value(node: Node, amounts: Map<string, DebitCredit>): number {
  if (node.children.length === 0) return signedBalance(node.cls, amounts.get(node.account.okey));
  return node.children.reduce((sum, c) => sum + value(c, amounts), 0);
}

/**
 * The rows of one report section set: the top-level nodes of the given classes, expanded per
 * `expandedKeys`, each group carrying the subtotal of its subtree. Rows that are zero in both
 * years are dropped unless `showZero`. Inputs are not mutated.
 */
export function buildReportRows(
  accounts: AccountModel[], classes: AccountClass[], current: Map<string, DebitCredit>, previous: Map<string, DebitCredit>,
  expandedKeys: string[], showZero: boolean,
): ReportRow[] {
  const rows: ReportRow[] = [];
  const expanded = new Set(expandedKeys);
  const walk = (node: Node, depth: number): void => {
    const cur = value(node, current);
    const prev = value(node, previous);
    if (!showZero && cur === 0 && prev === 0) return;
    const hasChildren = node.children.length > 0;
    const isExpanded = hasChildren && expanded.has(node.account.okey);
    rows.push({
      okey: node.account.okey, id: node.account.id ?? '', name: node.account.name ?? '', depth,
      kind: hasChildren ? 'group' : 'account', hasChildren, isExpanded, current: cur, previous: prev,
    });
    if (isExpanded) node.children.forEach(c => walk(c, depth + 1));
  };
  buildForest(accounts).filter(n => classes.includes(n.cls)).forEach(n => walk(n, 0));
  return rows;
}

/** Keys to expand so the report opens `maxDepth` tiers deep (top-level groups and their children by default). */
export function defaultExpandedKeys(accounts: AccountModel[], maxDepth = 2): string[] {
  const keys: string[] = [];
  const walk = (node: Node, depth: number): void => {
    if (depth >= maxDepth || node.children.length === 0) return;
    keys.push(node.account.okey);
    node.children.forEach(c => walk(c, depth + 1));
  };
  buildForest(accounts).forEach(n => walk(n, 0));
  return keys;
}

/** Sum of the signed values of every top-level node of the given classes. */
export function totalForClasses(accounts: AccountModel[], classes: AccountClass[], amounts: Map<string, DebitCredit>): number {
  return buildForest(accounts).filter(n => classes.includes(n.cls)).reduce((sum, n) => sum + value(n, amounts), 0);
}

/** Jahresergebnis: Ertrag + Erfolg − Aufwand of the amounts given (pass a within-year aggregation). */
export function yearResult(accounts: AccountModel[], amounts: Map<string, DebitCredit>): number {
  return totalForClasses(accounts, ['revenue', 'result'], amounts) - totalForClasses(accounts, ['expense'], amounts);
}

/** The visible rows as `;`-separated CSV, amounts in francs with two decimals. */
export function reportToCsv(rows: ReportRow[], header: string[]): string {
  const cell = (s: string): string => /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  const francs = (minor: number): string => (minor / 100).toFixed(2);
  const lines = rows.map(r => [cell(r.id), cell(r.name), francs(r.current), francs(r.previous)].join(';'));
  return [header.map(cell).join(';'), ...lines].join('\n');
}

/** ER filter value: every line. */
export const ALL_COST_CENTERS = '';
/** ER filter value: the "ohne Kostenstelle" bucket. */
export const NO_COST_CENTER = '__none__';

/** A booking-line dimension a result can be cut by. */
export type LineDimension = 'costCenterKey' | 'projectKey';

/**
 * Lines whose `dimension` value is in `keys`. Legacy lines lack the field and count as empty
 * (`''`), so they are kept only when `keys` contains `''`.
 */
export function filterLinesByDimension(lines: BookingLineModel[], dimension: LineDimension, keys: Set<string>): BookingLineModel[] {
  return lines.filter(l => keys.has(l[dimension] ?? ''));
}

/**
 * Lines of one Kostenstelle subtree (spec 1.65 §1 criterion 2). `subtreeKeys` = the selected node
 * and its descendants (`costCenterSubtreeKeys`). Missing keys on legacy lines count as empty.
 */
export function filterLinesByCostCenter(lines: BookingLineModel[], selection: string, subtreeKeys: Set<string>): BookingLineModel[] {
  if (selection === ALL_COST_CENTERS) return lines;
  if (selection === NO_COST_CENTER) return lines.filter(l => !(l.costCenterKey ?? ''));
  return filterLinesByDimension(lines, 'costCenterKey', subtreeKeys);
}

/**
 * The selection that actually filters: all when the filter is off (non-native ledger / no
 * Kostenstellen) or when the stored key is no longer an option (e.g. left over from another tenant).
 */
export function effectiveCostCenterSelection(selected: string, enabled: boolean, optionKeys: string[]): string {
  return enabled && optionKeys.includes(selected) ? selected : ALL_COST_CENTERS;
}

export interface ProjectResultLabels { income: string; expense: string; profit: string; loss: string }

/**
 * The single-column result of a dimension slice (project result): Ertrag, Aufwand and übriger
 * Erfolg (class `result`, accounts 7-9) with their totals, closed by the net — computed by the
 * same rule as the Erfolgsrechnung (`yearResult`: revenue + result − expense).
 * `amounts` = the slice's `sumLinesByAccount`. No previous-year values.
 */
export function buildProjectResultRows(
  accounts: AccountModel[], amounts: Map<string, DebitCredit>, labels: ProjectResultLabels,
): { rows: ReportRow[]; net: number } {
  const none = new Map<string, DebitCredit>();
  const expanded = accounts.map(a => a.okey);   // flat statement: every group open
  const synthetic = (okey: string, kind: 'total' | 'result', name: string, current: number): ReportRow =>
    ({ okey, id: '', name, depth: 0, kind, hasChildren: false, isExpanded: false, current, previous: 0 });
  const build = (cls: AccountClass): ReportRow[] => buildReportRows(accounts, [cls], amounts, none, expanded, false);
  const other = build('result');
  const net = yearResult(accounts, amounts);
  const rows = [
    ...build('revenue'), synthetic('total-income', 'total', labels.income, totalForClasses(accounts, ['revenue'], amounts)),
    ...build('expense'), synthetic('total-expense', 'total', labels.expense, totalForClasses(accounts, ['expense'], amounts)),
    ...other,
    synthetic('project-result', 'result', net < 0 ? labels.loss : labels.profit, net),
  ];
  return { rows, net };
}

/** One booking behind an account row of a dimension slice: the booking's own amount on that account. */
export interface AccountBookingRow { bookingKey: string; date: string; bookingNo: number; title: string; amount: number }

/**
 * The posted bookings behind each account of a slice (project result drill-down), keyed by account
 * okey, oldest first. Several lines of one booking on the same account are summed; the amount is
 * signed like the account's report row (`signedBalance` by the account number's class), so the
 * rows of an account add up to its `current`.
 */
export function bookingsByAccount(lines: BookingLineModel[], bookings: BookingModel[], accounts: AccountModel[]): Map<string, AccountBookingRow[]> {
  const posted = postedByKey(bookings);
  const idByKey = new Map(accounts.map(a => [a.okey, a.id ?? '']));
  const out = new Map<string, AccountBookingRow[]>();
  for (const [accountKey, perBooking] of sumsByAccountAndBooking(lines, posted)) {
    const cls = accountClass(idByKey.get(accountKey) ?? '');
    const rows = [...perBooking].map(([bookingKey, dc]) => bookingRow(bookingKey, posted.get(bookingKey), signedBalance(cls, dc)));
    out.set(accountKey, rows.sort(byDateAndNumber));
  }
  return out;
}

function postedByKey(bookings: BookingModel[]): Map<string, BookingModel> {
  return new Map(bookings.filter(b => b.status === 'posted').map(b => [b.okey, b]));
}

function bookingRow(bookingKey: string, b: BookingModel | undefined, amount: number): AccountBookingRow {
  return { bookingKey, date: b?.date ?? '', bookingNo: b?.bookingNo ?? 0, title: b?.title ?? '', amount };
}

function byDateAndNumber(a: AccountBookingRow, b: AccountBookingRow): number {
  return a.date.localeCompare(b.date) || a.bookingNo - b.bookingNo;
}

/** account okey → booking okey → debit/credit, over the lines of posted bookings; several lines of one booking on one account are summed. */
function sumsByAccountAndBooking(lines: BookingLineModel[], posted: Map<string, BookingModel>): Map<string, Map<string, DebitCredit>> {
  const sums = new Map<string, Map<string, DebitCredit>>();
  for (const line of lines) {
    const accountKey = line.accountKey ?? '';
    if (!accountKey || !posted.has(line.bookingKey)) continue;
    const perBooking = sums.get(accountKey) ?? new Map<string, DebitCredit>();
    const entry = perBooking.get(line.bookingKey) ?? { debit: 0, credit: 0 };
    entry.debit += line.debitAmount?.amount ?? 0;
    entry.credit += line.creditAmount?.amount ?? 0;
    perBooking.set(line.bookingKey, entry);
    sums.set(accountKey, perBooking);
  }
  return sums;
}

export interface SplitProjectResultLabels { income: string; expense: string; net: string }

export interface SplitProjectResult {
  /** Einnahmen heading + its accounts, Ausgaben heading + its accounts, then the net. Row okeys are prefixed `income:` / `expense:`. */
  rows: ReportRow[];
  /** prefixed account row okey → that side's bookings, oldest first, each amount positive */
  details: Map<string, AccountBookingRow[]>;
  income: number;
  expense: number;
  net: number;
}

/** Row-okey prefixes of the two sides of a split project result (an account may appear under both). */
export const INCOME_ROW_PREFIX = 'income:';
export const EXPENSE_ROW_PREFIX = 'expense:';

/**
 * The project result split by booking direction instead of by account class: every posted booking
 * of the slice nets out per account, a net credit counts under Einnahmen, a net debit under
 * Ausgaben. An account booked both ways (an event that books receipts and costs on one account)
 * therefore appears under both headings, and every amount shown is positive. The net equals the
 * class-based result (`yearResult`): Einnahmen − Ausgaben over all P&L accounts (classes 3–9).
 * A reversal inflates both sides by the same amount; the net stays right.
 * Each side keeps the chart's tree (groups open, subtotals), headed by a group row with the side's
 * total; balance-sheet accounts (classes 1–2) are left out, as in the class-based result.
 */
export function buildSplitProjectResult(
  accounts: AccountModel[], lines: BookingLineModel[], bookings: BookingModel[], labels: SplitProjectResultLabels,
): SplitProjectResult {
  const posted = postedByKey(bookings);
  const incomeByAccount = new Map<string, number>();
  const expenseByAccount = new Map<string, number>();
  const details = new Map<string, AccountBookingRow[]>();
  const add = (prefix: string, totals: Map<string, number>, accountKey: string, row: AccountBookingRow): void => {
    totals.set(accountKey, (totals.get(accountKey) ?? 0) + row.amount);
    const list = details.get(prefix + accountKey) ?? [];
    list.push(row);
    details.set(prefix + accountKey, list);
  };
  const isProfitAndLoss = new Set(accounts.filter(a => ['revenue', 'expense', 'result'].includes(accountClass(a.id))).map(a => a.okey));
  for (const [accountKey, perBooking] of sumsByAccountAndBooking(lines, posted)) {
    if (!isProfitAndLoss.has(accountKey)) continue;
    for (const [bookingKey, dc] of perBooking) {
      const netCredit = dc.credit - dc.debit;
      if (netCredit > 0) add(INCOME_ROW_PREFIX, incomeByAccount, accountKey, bookingRow(bookingKey, posted.get(bookingKey), netCredit));
      else if (netCredit < 0) add(EXPENSE_ROW_PREFIX, expenseByAccount, accountKey, bookingRow(bookingKey, posted.get(bookingKey), -netCredit));
    }
  }
  details.forEach(list => list.sort(byDateAndNumber));

  const forest = buildForest(accounts).filter(n => n.cls === 'revenue' || n.cls === 'expense' || n.cls === 'result');
  const side = (prefix: string, okey: string, label: string, totals: Map<string, number>): { rows: ReportRow[]; total: number } => {
    const sum = (node: Node): number => node.children.length === 0
      ? totals.get(node.account.okey) ?? 0
      : node.children.reduce((s, c) => s + sum(c), 0);
    const rows: ReportRow[] = [];
    const walk = (node: Node, depth: number): void => {
      const current = sum(node);
      if (current === 0) return;
      const hasChildren = node.children.length > 0;
      rows.push({
        okey: prefix + node.account.okey, id: node.account.id ?? '', name: node.account.name ?? '', depth,
        kind: hasChildren ? 'group' : 'account', hasChildren, isExpanded: hasChildren, current, previous: 0,
      });
      node.children.forEach(c => walk(c, depth + 1));
    };
    forest.forEach(n => walk(n, 1));
    const total = forest.reduce((s, n) => s + sum(n), 0);
    const heading: ReportRow = { okey, id: '', name: label, depth: 0, kind: 'total', hasChildren: false, isExpanded: false, current: total, previous: 0 };
    return { rows: [heading, ...rows], total };
  };
  const income = side(INCOME_ROW_PREFIX, 'total-income', labels.income, incomeByAccount);
  const expense = side(EXPENSE_ROW_PREFIX, 'total-expense', labels.expense, expenseByAccount);
  const net = income.total - expense.total;
  const result: ReportRow = { okey: 'project-result', id: '', name: labels.net, depth: 0, kind: 'result', hasChildren: false, isExpanded: false, current: net, previous: 0 };
  return { rows: [...income.rows, ...expense.rows, result], details, income: income.total, expense: expense.total, net };
}

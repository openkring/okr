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

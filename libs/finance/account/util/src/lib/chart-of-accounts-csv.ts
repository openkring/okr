import { AccountModel } from '@okr/shared-models';

import { getAccountIndex } from './account.util';

/**
 * CSV exchange format of a chart of accounts (Kontoplan), e.g. as exported by Banana/Sage:
 *
 * ```
 * Nummer,Name,Gruppe,Kontoart
 * 1,Aktiven,,Gruppe
 * 10,Umlaufvermögen,1,Gruppe
 * 1000,Kasse,10,Aktiv
 * ```
 *
 * - `Nummer`   account number (`AccountModel.id`)
 * - `Name`     account name
 * - `Gruppe`   number of the parent account; empty = directly under the chart's root
 * - `Kontoart` `Gruppe` for grouping rows, otherwise the kind of the bookable account
 *              (Aktiv, Passiv, Ertrag, Aufwand, Komplett). Stored in `AccountModel.label` so a
 *              re-export reproduces it; if missing it is derived from the account number.
 *
 * The root account itself is not part of the file — it is the file.
 */
export const CSV_HEADER = ['Nummer', 'Name', 'Gruppe', 'Kontoart'] as const;

export const ACCOUNT_KIND_GROUP = 'Gruppe';
export const ACCOUNT_KINDS = ['Aktiv', 'Passiv', 'Ertrag', 'Aufwand', 'Komplett'] as const;
export type AccountKind = typeof ACCOUNT_KINDS[number];

export interface ChartOfAccountsRow {
  id: string;
  name: string;
  parentId: string;
  kind: string;
}

export interface ChartOfAccountsImport {
  accounts: AccountModel[];     // root first, then the rows in file order
  /** account numbers whose `Gruppe` does not exist in the file — they were attached to the root */
  orphans: string[];
  /** account numbers that appear more than once — only the first occurrence is kept */
  duplicates: string[];
}

export class ChartOfAccountsCsvError extends Error {
  constructor(public readonly code: 'empty' | 'missing-columns', detail = '') {
    super(`${code} ${detail}`.trim());
  }
}

/*-------------------------- low-level csv --------------------------------*/
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Picks `;` or `,` by which one occurs more often in the header line. */
export function detectDelimiter(headerLine: string): ',' | ';' {
  const semicolons = (headerLine.match(/;/g) ?? []).length;
  const commas = (headerLine.match(/,/g) ?? []).length;
  return semicolons > commas ? ';' : ',';
}

/** Minimal RFC-4180 field splitter for one line: quotes, doubled quotes, trimmed fields. */
export function splitCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      out.push(field.trim()); field = '';
    } else {
      field += ch;
    }
  }
  out.push(field.trim());
  return out;
}

/*-------------------------- parse --------------------------------*/
/**
 * Parse the CSV text into rows. Column order is taken from the header (case-insensitive);
 * `Gruppe` and `Kontoart` are optional, `Nummer` and `Name` are required. Blank lines are skipped.
 */
export function parseChartOfAccountsCsv(text: string): ChartOfAccountsRow[] {
  const lines = stripBom(text).replace(/\r\n?/g, '\n').split('\n').filter(l => l.trim().length > 0);
  if (lines.length === 0) throw new ChartOfAccountsCsvError('empty');
  const delimiter = detectDelimiter(lines[0]);
  const header = splitCsvLine(lines[0], delimiter).map(h => h.toLowerCase());
  const col = (name: string) => header.indexOf(name.toLowerCase());
  const idCol = col('Nummer'), nameCol = col('Name'), parentCol = col('Gruppe'), kindCol = col('Kontoart');
  if (idCol < 0 || nameCol < 0) throw new ChartOfAccountsCsvError('missing-columns', 'Nummer, Name');

  const rows: ChartOfAccountsRow[] = [];
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line, delimiter);
    const id = cells[idCol] ?? '';
    if (id.length === 0) continue;
    rows.push({
      id,
      name: cells[nameCol] ?? '',
      parentId: parentCol >= 0 ? (cells[parentCol] ?? '') : '',
      kind: kindCol >= 0 ? (cells[kindCol] ?? '') : '',
    });
  }
  if (rows.length === 0) throw new ChartOfAccountsCsvError('empty');
  return rows;
}

/**
 * Turn parsed rows into ready-to-store AccountModels under a new root.
 * okeys are `<rootKey>-<number>` so the chart can be re-imported into a second root without
 * colliding with the first one or with the seeded KMU chart.
 */
export function buildImportedChartOfAccounts(
  rows: ChartOfAccountsRow[],
  tenantId: string,
  accountingTenantId: string,
  rootKey: string,
  rootName: string
): ChartOfAccountsImport {
  const duplicates: string[] = [];
  const unique: ChartOfAccountsRow[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.id)) { duplicates.push(row.id); continue; }
    seen.add(row.id);
    unique.push(row);
  }
  const parentIds = new Set(unique.map(r => r.parentId).filter(p => p.length > 0));
  const keyOf = (id: string) => `${rootKey}-${id}`;

  const build = (okey: string, id: string, name: string, type: string, parentKey: string, label = ''): AccountModel => {
    const account = new AccountModel(tenantId);
    account.okey = okey;
    account.accountingTenantId = accountingTenantId;
    account.id = id;
    account.name = name;
    account.type = type;
    account.parentKey = parentKey;
    account.label = label;
    account.index = getAccountIndex(account);
    return account;
  };

  const orphans: string[] = [];
  const root = build(rootKey, '', rootName, 'root', '');
  const accounts = unique.map(row => {
    const isGroup = row.kind === ACCOUNT_KIND_GROUP || parentIds.has(row.id);
    let parentKey = rootKey;
    if (row.parentId.length > 0) {
      if (seen.has(row.parentId)) parentKey = keyOf(row.parentId);
      else orphans.push(row.id);
    }
    const label = isGroup ? '' : row.kind;
    return build(keyOf(row.id), row.id, row.name || row.id, isGroup ? 'group' : 'leaf', parentKey, label);
  });
  return { accounts: [root, ...accounts], orphans, duplicates };
}

/*-------------------------- export --------------------------------*/
/** Kontoart of a bookable account: the stored label if it is one, else derived from the number. */
export function getAccountKind(account: AccountModel): string {
  if ((ACCOUNT_KINDS as readonly string[]).includes(account.label)) return account.label;
  switch (account.id.charAt(0)) {
    case '1': return 'Aktiv';
    case '2': return 'Passiv';
    case '3': return 'Ertrag';
    case '9': return 'Komplett';
    default: return account.id.length > 0 ? 'Aufwand' : '';
  }
}

/**
 * Serialize the accounts under the given roots into CSV rows (header first), in tree order
 * (depth-first, siblings by number). Roots are not exported; their direct children get an empty `Gruppe`.
 */
export function chartOfAccountsToRows(accounts: AccountModel[], roots = accounts.filter(a => a.type === 'root')): string[][] {
  const rows: string[][] = [[...CSV_HEADER]];
  const byParent = new Map<string, AccountModel[]>();
  for (const a of accounts) {
    if (a.type === 'root') continue;
    const list = byParent.get(a.parentKey) ?? [];
    list.push(a);
    byParent.set(a.parentKey, list);
  }
  for (const list of byParent.values()) list.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

  const walk = (parentKey: string, parentId: string): void => {
    for (const a of byParent.get(parentKey) ?? []) {
      const isGroup = a.type === 'group' || byParent.has(a.okey);
      rows.push([a.id, a.name, parentId, isGroup ? ACCOUNT_KIND_GROUP : getAccountKind(a)]);
      walk(a.okey, a.id);
    }
  };
  for (const root of roots) walk(root.okey, '');
  return rows;
}

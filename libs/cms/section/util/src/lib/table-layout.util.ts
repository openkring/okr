import {
  TABLE_CONFIG_SHAPE, TableAlign, TableBreakpoint, TableColumn, TableColumnWidth, TableConfig, TableResponsive, TableResponsiveMode, TableStyle,
} from '@okr/shared-models';

/**
 * The table as the table editor and the renderer see it: an optional header row, rows of cells and the columns. It is stored as before
 * (`data.header`, `data.body` row by row, `grid.template`), so older apps draw it unchanged; `columns` and `responsive` are added by the
 * editor. Every function returns a new value.
 */
export interface TableContent {
  hasHeader: boolean;
  /** as many cells as columns, also while hasHeader is false (kept for switching it on again within the editor) */
  header: string[];
  rows: string[][];
  columns: TableColumn[];
}

/** the cell of a table: row -1 is the header row */
export interface TableCellRef { row: number; col: number }

/** stored widths of the presets: older apps read `grid.template` */
const PRESET_WIDTHS: Record<'narrow' | 'wide', string> = { narrow: '100px', wide: '300px' };
/** what the renderer draws for them: flexible, so that a narrow container still has room for the other columns */
const FLUID_WIDTHS: Record<'auto' | 'narrow' | 'wide', string> = { auto: 'auto', narrow: 'minmax(4rem, 100px)', wide: 'minmax(6rem, 300px)' };
const PX = /^(\d+(?:\.\d+)?)px$/;

/** width of the container (px) below which a table stacks or scrolls */
export const TABLE_BREAKPOINT_WIDTHS: Record<TableBreakpoint, number> = { mobile: 480, tablet: 768 };
export const DEFAULT_TABLE_RESPONSIVE: TableResponsive = { mode: 'auto', breakpoint: 'mobile' };
export const TABLE_ALIGNS: readonly TableAlign[] = ['left', 'center', 'right'];
export const TABLE_WIDTH_PRESETS = ['auto', 'narrow', 'wide'] as const;

// ---------------------------------------------------- columns ----------------------------------------------------

/** the tracks of a grid template, split at spaces outside of parentheses ('minmax(4rem, 100px) auto' → two) */
export function templateTracks(template: string | undefined): string[] {
  const tracks: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of (template ?? '').trim()) {
    if (char === '(') depth++;
    if (char === ')') depth = Math.max(0, depth - 1);
    if (/\s/.test(char) && depth === 0) {
      if (current) tracks.push(current);
      current = '';
    } else current += char;
  }
  if (current) tracks.push(current);
  return tracks;
}

/** a stored track as a column width: the preset widths are recognised, 'auto' and '1fr' share the rest */
function widthOfTrack(track: string): TableColumnWidth {
  if (track === 'auto' || track === '1fr') return 'auto';
  if (track === PRESET_WIDTHS.narrow) return 'narrow';
  if (track === PRESET_WIDTHS.wide) return 'wide';
  return track;
}

/** The columns of a table: as the editor stored them, else read from `grid.template`, else one per header cell (at least one). */
export function tableColumnsOf(config: Partial<TableConfig> | undefined): TableColumn[] {
  if (config?.columns && config.columns.length > 0) return config.columns.map((c) => ({ ...c, width: c.width || 'auto' }));
  const tracks = templateTracks(config?.grid?.template);
  if (tracks.length > 0) return tracks.map((track) => ({ width: widthOfTrack(track) }));
  const count = Math.max(1, config?.data?.header?.length ?? 0);
  return Array.from({ length: count }, () => ({ width: 'auto' }));
}

/** `grid.template` as stored: what older apps draw */
export function templateOf(columns: readonly TableColumn[]): string {
  return columns.map((c) => (c.width === 'narrow' || c.width === 'wide' ? PRESET_WIDTHS[c.width] : c.width || 'auto')).join(' ');
}

/** the template the renderer draws: fixed px widths shrink down to a minimum, so that a narrow container keeps room for the rest */
export function fluidTemplateOf(columns: readonly TableColumn[]): string {
  return columns.map((c) => {
    const width = c.width || 'auto';
    if (width === 'auto' || width === 'narrow' || width === 'wide') return FLUID_WIDTHS[width];
    const px = PX.exec(width);
    return px ? `minmax(min(${px[1]}px, 6rem), ${px[1]}px)` : width;
  }).join(' ');
}

// ---------------------------------------------------- content ----------------------------------------------------

/** a cell as text: older documents store numbers too */
function cellText(value: unknown): string {
  return value === undefined || value === null ? '' : String(value);
}

function padded(cells: readonly string[], length: number): string[] {
  return Array.from({ length }, (_, i) => cells[i] ?? '');
}

/** The stored table as header, rows and columns; the last row is filled up with empty cells. */
export function tableContentOf(config: Partial<TableConfig> | undefined): TableContent {
  const columns = tableColumnsOf(config);
  const count = columns.length;
  const header = (config?.data?.header ?? []).map(cellText);
  const body = (config?.data?.body ?? []).map(cellText);
  const rows: string[][] = [];
  for (let i = 0; i < body.length; i += count) rows.push(padded(body.slice(i, i + count), count));
  return { hasHeader: header.length > 0, header: padded(header, count), rows, columns };
}

/** The content written back into the stored fields: data, columns and the template older apps read. */
export function withTableContent(config: TableConfig, content: TableContent): TableConfig {
  return {
    ...config,
    data: { header: content.hasHeader ? [...content.header] : [], body: content.rows.flat() },
    columns: content.columns.map((c) => ({ ...c })),
    grid: { ...(config.grid ?? TABLE_CONFIG_SHAPE.grid), template: templateOf(content.columns) },
  };
}

/** a new table: two columns, a header row and two empty rows */
export function emptyTableContent(): TableContent {
  return { hasHeader: true, header: ['', ''], rows: [['', ''], ['', '']], columns: [{ width: 'auto' }, { width: 'auto' }] };
}

export function setTableCell(content: TableContent, { row, col }: TableCellRef, html: string): TableContent {
  if (row < 0) return { ...content, header: content.header.map((cell, c) => (c === col ? html : cell)) };
  return { ...content, rows: content.rows.map((cells, r) => (r === row ? cells.map((cell, c) => (c === col ? html : cell)) : cells)) };
}

export function setTableHeader(content: TableContent, hasHeader: boolean): TableContent {
  return { ...content, hasHeader };
}

/** inserts an empty row before `at` (at = rows.length appends) */
export function insertTableRow(content: TableContent, at: number): TableContent {
  const rows = [...content.rows];
  rows.splice(Math.max(0, Math.min(at, rows.length)), 0, padded([], content.columns.length));
  return { ...content, rows };
}

export function deleteTableRow(content: TableContent, at: number): TableContent {
  return { ...content, rows: content.rows.filter((_, r) => r !== at) };
}

/** moves a row by one up (-1) or down (+1); unchanged at the edge */
export function moveTableRow(content: TableContent, at: number, by: -1 | 1): TableContent {
  const to = at + by;
  if (at < 0 || at >= content.rows.length || to < 0 || to >= content.rows.length) return content;
  const rows = [...content.rows];
  [rows[at], rows[to]] = [rows[to], rows[at]];
  return { ...content, rows };
}

/** inserts an empty column before `at` (at = columns.length appends) */
export function insertTableColumn(content: TableContent, at: number): TableContent {
  const index = Math.max(0, Math.min(at, content.columns.length));
  const insert = <T>(cells: readonly T[], value: T): T[] => [...cells.slice(0, index), value, ...cells.slice(index)];
  return {
    ...content,
    header: insert(content.header, ''),
    rows: content.rows.map((cells) => insert(cells, '')),
    columns: insert(content.columns, { width: 'auto' } as TableColumn),
  };
}

/** removes a column; the last one stays */
export function deleteTableColumn(content: TableContent, at: number): TableContent {
  if (content.columns.length <= 1) return content;
  const without = <T>(cells: readonly T[]): T[] => cells.filter((_, c) => c !== at);
  return { ...content, header: without(content.header), rows: content.rows.map(without), columns: without(content.columns) };
}

export function setTableColumn(content: TableContent, at: number, patch: Partial<TableColumn>): TableContent {
  return { ...content, columns: content.columns.map((c, i) => (i === at ? { ...c, ...patch } : c)) };
}

// ---------------------------------------------------- responsive ----------------------------------------------------

export function tableResponsiveOf(config: Partial<TableConfig> | undefined): TableResponsive {
  return { ...DEFAULT_TABLE_RESPONSIVE, ...(config?.responsive ?? {}) };
}

/** what a narrow container does: 'auto' stacks up to two columns and scrolls wider tables */
export function effectiveTableMode(mode: TableResponsiveMode, columnCount: number): Exclude<TableResponsiveMode, 'auto'> {
  if (mode !== 'auto') return mode;
  return columnCount <= 2 ? 'stack' : 'scroll';
}

// ---------------------------------------------------- looks ----------------------------------------------------

export const TABLE_LOOKS = ['lines', 'plain', 'colored'] as const;
export type TableLook = (typeof TABLE_LOOKS)[number];
export const TABLE_SIZES = ['s', 'm', 'l'] as const;
export type TableSize = (typeof TABLE_SIZES)[number];

type LookStyle = Pick<TableStyle, 'backgroundColor' | 'border' | 'textColor' | 'fontWeight'>;
const LOOKS: Record<TableLook, { header: LookStyle; body: LookStyle }> = {
  lines: {
    header: { backgroundColor: 'var(--ion-color-light)', border: '0.5px solid var(--ion-color-medium)', textColor: '', fontWeight: 'bold' },
    body: { backgroundColor: '', border: '0.5px solid var(--ion-color-medium)', textColor: '', fontWeight: 'normal' },
  },
  plain: {
    header: { backgroundColor: '', border: 'none', textColor: '', fontWeight: 'bold' },
    body: { backgroundColor: '', border: 'none', textColor: '', fontWeight: 'normal' },
  },
  colored: {
    header: { backgroundColor: 'var(--ion-color-primary)', border: '0.5px solid var(--ion-color-light-shade)', textColor: 'var(--ion-color-primary-contrast)', fontWeight: 'bold' },
    body: { backgroundColor: '', border: '0.5px solid var(--ion-color-light-shade)', textColor: '', fontWeight: 'normal' },
  },
};
const SIZES: Record<TableSize, { header: string; body: string }> = {
  s: { header: '0.9rem', body: '0.75rem' },
  m: { header: '1rem', body: '0.8rem' },
  l: { header: '1.1rem', body: '1rem' },
};

const same = (a: string | undefined, b: string): boolean => (a ?? '') === b;
const sameLook = (style: Partial<TableStyle> | undefined, look: LookStyle): boolean =>
  same(style?.backgroundColor, look.backgroundColor) && same(style?.border, look.border) && same(style?.textColor, look.textColor)
  && same(style?.fontWeight, look.fontWeight);

/** the look the stored styles match; undefined: a look of its own («Eigene») */
export function tableLookOf(config: Partial<TableConfig> | undefined): TableLook | undefined {
  return TABLE_LOOKS.find((look) => sameLook(config?.header, LOOKS[look].header) && sameLook(config?.body, LOOKS[look].body));
}

export function applyTableLook(config: TableConfig, look: TableLook): TableConfig {
  return { ...config, header: { ...config.header, ...LOOKS[look].header }, body: { ...config.body, ...LOOKS[look].body } };
}

export function tableSizeOf(config: Partial<TableConfig> | undefined): TableSize | undefined {
  return TABLE_SIZES.find((size) => (config?.header?.fontSize ?? SIZES.m.header) === SIZES[size].header && (config?.body?.fontSize ?? SIZES.m.body) === SIZES[size].body);
}

export function applyTableSize(config: TableConfig, size: TableSize): TableConfig {
  return { ...config, header: { ...config.header, fontSize: SIZES[size].header }, body: { ...config.body, fontSize: SIZES[size].body } };
}

// ---------------------------------------------------- paste ----------------------------------------------------

/**
 * Cells copied from Excel, Numbers or Google Sheets (text/plain: tabs between cells, a line per row). A quoted cell may hold tabs,
 * line breaks and "" for a quote, as Excel writes it. A trailing line break is dropped. One cell without tab or line: [[text]].
 */
export function parseClipboardTable(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let atCellStart = true;
  const source = text.replace(/\r\n?/g, '\n');
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') quoted = false;
      else cell += char;
      continue;
    }
    if (char === '"' && atCellStart) { quoted = true; atCellStart = false; continue; }
    atCellStart = false;
    if (char === '\t') { row.push(cell); cell = ''; atCellStart = true; }
    else if (char === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; atCellStart = true; }
    else cell += char;
  }
  if (cell !== '' || row.length > 0) { row.push(cell); rows.push(row); }
  return rows;
}

/** true when the text holds more than one cell: then the editor takes it as table, else as text into the cell */
export function isClipboardTable(cells: readonly (readonly string[])[]): boolean {
  return cells.length > 1 || (cells[0]?.length ?? 0) > 1;
}

/** a pasted cell as the HTML a cell stores: escaped, line breaks as <br> */
export function clipboardCellToHtml(text: string): string {
  return text.trim().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
}

/**
 * Pastes cells from `at` to the right and down; rows and columns are added as needed. Pasted into the header row, the first pasted
 * row fills the header, the others the rows from the top.
 */
export function pasteTableCells(content: TableContent, at: TableCellRef, cells: readonly (readonly string[])[]): TableContent {
  const width = Math.max(0, ...cells.map((r) => r.length));
  let next = content;
  while (next.columns.length < at.col + width) next = insertTableColumn(next, next.columns.length);
  const firstRow = at.row < 0 ? 0 : at.row;
  const bodyRows = at.row < 0 ? cells.length - 1 : cells.length;
  while (next.rows.length < firstRow + bodyRows) next = insertTableRow(next, next.rows.length);
  cells.forEach((values, r) => {
    values.forEach((value, c) => {
      const row = at.row < 0 ? r - 1 : at.row + r;
      next = setTableCell(next, { row, col: at.col + c }, clipboardCellToHtml(value));
    });
  });
  return at.row < 0 ? { ...next, hasHeader: true } : next;
}

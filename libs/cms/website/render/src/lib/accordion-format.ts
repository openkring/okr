/**
 * Formatting of a public accordion section (spec: the app's AccordionConfig — viewType, columns, title style/size,
 * open/closed icon with colour and position, text background/size). The app resolves the same defaults in
 * `withAccordionDefaults` (@okr/cms-section-util); this copy stays here because the render lib must stay Node-safe.
 */

export type PublicAccordionView = 'list' | 'cards';
type ScreenSize = 'sm' | 'md' | 'lg';
const SCREEN_SIZES: ScreenSize[] = ['sm', 'md', 'lg'];
const DEFAULT_COLUMNS: Record<ScreenSize, number> = { sm: 1, md: 2, lg: 2 };
const MAX_COLUMNS = 4;
/** = IMGIX_BASE of section-mapper (not imported: section-mapper imports this file) */
const ICON_BASE = 'https://bkaiser.imgix.net/logo';

export interface PublicAccordionItem { label: string; content: string }

/** One arrangement of the cards; `cls` names the screen sizes it shows on (acc-sm / acc-md / acc-lg). */
export interface PublicAccordionLayout {
  cls: string;
  columns: { items: PublicAccordionItem[] }[];
}

export interface PublicAccordionFormat {
  view: PublicAccordionView;
  /** css class of the titles ('' = the template's own default) */
  titleClass: string;
  /** css custom properties for the section root: sizes, colours, icon urls — every value validated */
  style: string;
  iconStart: boolean;
  /** single-open accordion: the <details> share a `name` (native exclusive accordion) */
  exclusive: boolean;
  /** 'cards' only: the column arrangements, one per distinct column count */
  layouts: PublicAccordionLayout[];
}

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const ICON = /^(?:([a-z0-9_-]{1,40}):)?([a-z0-9_-]{1,60})$/i;

/** a css hex colour, or '' when it is missing or anything else */
export function accordionColor(raw: unknown): string {
  return typeof raw === 'string' && HEX.test(raw.trim()) ? raw.trim() : '';
}

/** a font size in rem, clamped to 0.5–3; absent or invalid = 1 */
export function accordionSizeRem(raw: unknown): number {
  const n = Number(raw);
  if (raw === undefined || raw === null || raw === '' || !Number.isFinite(n) || n <= 0) return 1;
  return Math.min(3, Math.max(0.5, n));
}

/** imgix url of an icon name (`add`, or qualified `filetypes:pdf`); '' for anything that is not a plain name */
export function accordionIconUrl(raw: unknown, fallback: string): string {
  const name = typeof raw === 'string' && raw.trim() ? raw.trim() : fallback;
  const m = ICON.exec(name);
  return m ? `${ICON_BASE}/${m[1] ?? 'icons'}/${m[2]}.svg` : `${ICON_BASE}/icons/${fallback}.svg`;
}

function columnCount(raw: unknown, fallback: number): number {
  const n = Math.round(Number(raw ?? fallback));
  return Number.isFinite(n) ? Math.min(MAX_COLUMNS, Math.max(1, n)) : fallback;
}

/** column-major split: the first ceil(n/columns) items go into the first column, and so on */
export function splitAccordionColumns<T>(items: readonly T[], columns: number): T[][] {
  const count = Math.max(1, Math.min(columns, items.length || 1));
  const perColumn = Math.ceil(items.length / count) || 1;
  return Array.from({ length: count }, (_, c) => items.slice(c * perColumn, (c + 1) * perColumn)).filter((col, i) => col.length > 0 || i === 0);
}

/** one layout per distinct column count over sm / md / lg, so each screen size shows exactly one */
export function accordionLayouts(items: readonly PublicAccordionItem[], rawColumns: unknown): PublicAccordionLayout[] {
  const cols = (rawColumns ?? {}) as Partial<Record<ScreenSize, unknown>>;
  const counts = SCREEN_SIZES.map((size) => Math.min(columnCount(cols[size], DEFAULT_COLUMNS[size]), Math.max(1, items.length)));
  const layouts: { count: number; sizes: ScreenSize[] }[] = [];
  counts.forEach((count, i) => {
    const same = layouts.find((l) => l.count === count);
    if (same) same.sizes.push(SCREEN_SIZES[i]);
    else layouts.push({ count, sizes: [SCREEN_SIZES[i]] });
  });
  return layouts.map(({ count, sizes }) => ({
    cls: sizes.map((s) => 'acc-' + s).join(' '),
    columns: splitAccordionColumns(items, count).map((colItems) => ({ items: colItems })),
  }));
}

export function mapAccordionFormat(props: Record<string, unknown>, items: readonly PublicAccordionItem[]): PublicAccordionFormat {
  const view: PublicAccordionView = props['viewType'] === 'cards' ? 'cards' : 'list';
  const cards = view === 'cards';
  const titleStyle = props['titleStyle'];
  const titleClass = titleStyle === 'regular' || titleStyle === 'bold' || titleStyle === 'italic' || titleStyle === 'underline'
    ? 'acc-t-' + titleStyle : '';
  const iconColor = accordionColor(props['iconColor']);
  const textBg = accordionColor(props['textBackground']);
  const vars = [
    `--acc-title-size:${accordionSizeRem(props['titleSize'])}rem`,
    `--acc-text-size:${accordionSizeRem(props['textSize'])}rem`,
    `--acc-icon-closed:url('${accordionIconUrl(props['iconClosed'], cards ? 'add' : 'chevron-down')}')`,
    `--acc-icon-open:url('${accordionIconUrl(props['iconOpen'], cards ? 'remove' : 'chevron-up')}')`,
    ...(iconColor ? [`--acc-icon-color:${iconColor}`] : []),
    ...(textBg ? [`--acc-text-bg:${textBg}`] : []),
  ];
  const position = props['iconPosition'];
  return {
    view,
    titleClass,
    style: vars.join(';'),
    // the website's list always had its chevron after the title: absent = 'end' for both views
    iconStart: position === 'start',
    exclusive: props['multiple'] === false,
    layouts: cards ? accordionLayouts(items, props['columns']) : [],
  };
}

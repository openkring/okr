import { AccordionColumns, AccordionConfig, AccordionIconPosition, AccordionTitleStyle, AccordionViewType } from '@okr/shared-models';

export const ACCORDION_MAX_COLUMNS = 4;
export const ACCORDION_DEFAULT_COLUMNS: AccordionColumns = { sm: 1, md: 2, lg: 2 };
/** font sizes in rem the editor offers and the renderer accepts */
export const ACCORDION_MIN_SIZE = 0.5;
export const ACCORDION_MAX_SIZE = 3;

/** The accordion config with every optional formatting field resolved to its default. */
export interface ResolvedAccordionConfig extends AccordionConfig {
  viewType: AccordionViewType;
  columns: AccordionColumns;
  titleStyle: AccordionTitleStyle;
  titleSize: number;
  iconClosed: string;
  iconOpen: string;
  iconColor: string;
  iconPosition: AccordionIconPosition;
  textBackground: string;
  textSize: number;
}

/** Clamps a column count to 1–ACCORDION_MAX_COLUMNS; non-numbers fall back to `fallback`. */
export function accordionColumnCount(value: number | undefined, fallback: number): number {
  const n = Math.round(value ?? fallback);
  return Number.isFinite(n) ? Math.min(ACCORDION_MAX_COLUMNS, Math.max(1, n)) : fallback;
}

/** Clamps a rem size to ACCORDION_MIN_SIZE–ACCORDION_MAX_SIZE; absent or invalid = 1. */
export function accordionSize(value: number | undefined): number {
  const n = Number(value);
  if (value === undefined || !Number.isFinite(n) || n <= 0) return 1;
  return Math.min(ACCORDION_MAX_SIZE, Math.max(ACCORDION_MIN_SIZE, n));
}

/** Firestore reads return raw documents — older accordion sections lack all formatting fields. */
export function withAccordionDefaults(config: AccordionConfig | undefined): ResolvedAccordionConfig {
  const viewType: AccordionViewType = config?.viewType === 'cards' ? 'cards' : 'list';
  const cards = viewType === 'cards';
  const cols = config?.columns;
  return {
    multiple: config?.multiple ?? false,
    readonly: config?.readonly ?? true,
    value: config?.value ?? '',
    items: config?.items ?? [],
    viewType,
    columns: {
      sm: accordionColumnCount(cols?.sm, ACCORDION_DEFAULT_COLUMNS.sm),
      md: accordionColumnCount(cols?.md, ACCORDION_DEFAULT_COLUMNS.md),
      lg: accordionColumnCount(cols?.lg, ACCORDION_DEFAULT_COLUMNS.lg),
    },
    titleStyle: config?.titleStyle ?? 'regular',
    titleSize: accordionSize(config?.titleSize),
    iconClosed: config?.iconClosed?.trim() || (cards ? 'add' : 'chevron-down'),
    iconOpen: config?.iconOpen?.trim() || (cards ? 'remove' : 'chevron-up'),
    iconColor: config?.iconColor?.trim() ?? '',
    iconPosition: config?.iconPosition ?? (cards ? 'end' : 'start'),
    textBackground: config?.textBackground?.trim() ?? '',
    textSize: accordionSize(config?.textSize),
  };
}

/**
 * Splits items column-major into `columns` stacks of (nearly) equal length; when they do not divide evenly the
 * later columns take one more (11 items in 2 columns: 5 + 6, as on www.la21staefa.ch).
 * Each column stacks on its own, so opening an item never pushes the items of a neighbouring column down.
 * Mirrored by `splitAccordionColumns` in @okr/cms-website-render.
 */
export function splitIntoColumns<T>(items: readonly T[], columns: number): T[][] {
  const count = Math.max(1, Math.min(columns, items.length || 1));
  const base = Math.floor(items.length / count);
  const extra = items.length % count;
  const result: T[][] = [];
  let start = 0;
  for (let c = 0; c < count; c++) {
    const size = base + (c >= count - extra ? 1 : 0);
    result.push(items.slice(start, start + size));
    start += size;
  }
  return result;
}

/** The opened value(s) of an accordion as a list: ion-accordion's `value` is a single key, or keys separated by commas. */
export function accordionOpenValues(value: string | undefined): string[] {
  return (value ?? '').split(',').map((v) => v.trim()).filter((v) => v.length > 0);
}

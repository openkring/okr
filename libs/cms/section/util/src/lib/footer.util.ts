import {
  FOOTER_CONFIG_SHAPE, FOOTER_ITEM_SHAPE, FOOTER_ITEM_TYPES, FOOTER_LOGO_HEIGHTS, FOOTER_MAX_COLUMNS,
  FooterColumn, FooterConfig, FooterItem, FooterItemType
} from '@okr/shared-models';

/**
 * Fills in what a legacy or hand-edited footer document lacks: every config key, exactly
 * FOOTER_MAX_COLUMNS columns, and every item key. Unknown item types and logo heights are kept,
 * so the suite can flag them instead of silently rewriting the document.
 */
export function normalizeFooterConfig(config: Partial<FooterConfig> | undefined): FooterConfig {
  const merged = { ...FOOTER_CONFIG_SHAPE, ...config };
  const columns = Array.from({ length: FOOTER_MAX_COLUMNS }, (_, i): FooterColumn => ({
    items: (merged.columns?.[i]?.items ?? []).map(item => ({ ...FOOTER_ITEM_SHAPE, ...item })),
  }));
  return { ...merged, columns };
}

/** the column count clamped to 1…FOOTER_MAX_COLUMNS; a broken value falls back to the maximum */
export function footerColumnCount(config: Pick<FooterConfig, 'columnCount'>): number {
  const count = config.columnCount;
  if (!Number.isInteger(count)) return FOOTER_MAX_COLUMNS;
  return Math.min(Math.max(count, 1), FOOTER_MAX_COLUMNS);
}

/** the columns a viewer sees: the first `columnCount` ones; hidden columns keep their items */
export function footerVisibleColumns(config: FooterConfig): FooterColumn[] {
  return normalizeFooterConfig(config).columns.slice(0, footerColumnCount(config));
}

/** a new, empty item of the given type */
export function newFooterItem(type: FooterItemType): FooterItem {
  return { ...FOOTER_ITEM_SHAPE, type };
}

export function isFooterItemType(type: unknown): type is FooterItemType {
  return (FOOTER_ITEM_TYPES as readonly unknown[]).includes(type);
}

export function isFooterLogoHeight(height: unknown): boolean {
  return (FOOTER_LOGO_HEIGHTS as readonly unknown[]).includes(height);
}

/**
 * Targets a footer link may have: a web page (https), an email or phone link, or an app-internal
 * route ('/…'). Anything else — `javascript:`, `data:`, plain `http:` — is rejected, because the
 * public website renders these links on an unauthenticated page.
 */
export function isFooterUrl(url: string): boolean {
  return /^(https:\/\/|mailto:|tel:|\/(?!\/))/i.test(url.trim());
}

/** a link that leaves the app (opened in a new tab); mailto/tel and internal routes stay */
export function isExternalFooterUrl(url: string): boolean {
  return /^https:\/\//i.test(url.trim());
}

/** the Vest field name of one item field; the configuration's error notes use the same name */
export function footerItemField(column: number, index: number, field: keyof FooterItem): string {
  return `footer.c${column}.i${index}.${field}`;
}

/** one rendered unit of a column: a single item, or a run of consecutive logos sharing a row */
export type FooterBlock =
  | { kind: 'item'; item: FooterItem }
  | { kind: 'logos'; items: FooterItem[] };

/**
 * Groups consecutive logos into one block, so sponsor logos wrap side by side instead of each
 * taking a line. Logos without an image are dropped — they would render as a broken image.
 * Used by the app and mirrored by the public website renderer.
 */
export function footerBlocks(items: FooterItem[]): FooterBlock[] {
  const blocks: FooterBlock[] = [];
  for (const item of items) {
    if (item.type === 'logo') {
      if (!item.image) continue;
      const last = blocks[blocks.length - 1];
      if (last?.kind === 'logos') last.items.push(item);
      else blocks.push({ kind: 'logos', items: [item] });
    } else {
      blocks.push({ kind: 'item', item });
    }
  }
  return blocks;
}

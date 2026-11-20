import {
  FOOTER_CONFIG_SHAPE, FOOTER_ITEM_SHAPE, FOOTER_ITEM_TYPES, FOOTER_LOGO_HEIGHTS, FOOTER_MAX_COLUMNS,
  FooterColumn, FooterConfig, FooterItem, FooterItemType, FooterLink
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
  const links = (list: FooterLink[] | undefined): FooterLink[] =>
    (Array.isArray(list) ? list : []).map((l) => ({ label: l?.label ?? '', url: l?.url ?? '', icon: l?.icon ?? '' }));
  return { ...merged, columns, background: merged.background ?? '', social: links(merged.social), bottomLinks: links(merged.bottomLinks) };
}

/** a new, empty social or bottom-line link */
export function newFooterLink(): FooterLink {
  return { label: '', url: '', icon: '' };
}

/** the field name of one social / bottom-line link field (footer.social.i0.url) */
export function footerLinkField(list: 'social' | 'bottomLinks', index: number, field: keyof FooterLink): string {
  return `footer.${list}.i${index}.${field}`;
}

const FOOTER_HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** a footer background that may go into a style binding; '' = the theme's footer colour */
export function footerBackground(value: string | undefined): string {
  const v = value?.trim() ?? '';
  return FOOTER_HEX.test(v) ? v : '';
}

/** dark backgrounds get white text: relative luminance below 0.5 */
export function isDarkColor(hex: string): boolean {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  if (!/^[0-9a-f]{6}$/i.test(full)) return false;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.5;
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

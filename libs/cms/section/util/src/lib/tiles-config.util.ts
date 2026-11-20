import { TILES_CONFIG_SHAPE, TileItem, TileVariant, TilesConfig } from '@okr/shared-models';

/** Firestore reads return raw documents — older sections lack the newer fields. */
export function withTilesDefaults(config: TilesConfig | undefined): TilesConfig {
  return {
    ...config,
    variant: config?.variant ?? TILES_CONFIG_SHAPE.variant,
    columns: config?.columns ?? TILES_CONFIG_SHAPE.columns,
    items: config?.items ?? TILES_CONFIG_SHAPE.items,
  };
}

/** Column count from md up, clamped to 1–6 (mobile collapses to one column in CSS). */
export const TILES_MAX_COLUMNS = 6;
export function tilesColumns(columns: number | undefined): number {
  const cols = Math.round(columns ?? TILES_CONFIG_SHAPE.columns);
  return Number.isFinite(cols) ? Math.min(TILES_MAX_COLUMNS, Math.max(1, cols)) : TILES_CONFIG_SHAPE.columns;
}

const trimmed = (s: string | undefined): string | undefined => {
  const t = s?.trim();
  return t ? t : undefined;
};

/**
 * Keeps only tiles that can be rendered — a stat needs its `value`, a card its `title` — trims the
 * text fields and coalesces `tone` to 'primary' (legacy/seeded items may omit it).
 */
export function validTiles(items: TileItem[] | undefined, variant: TileVariant): TileItem[] {
  return (items ?? [])
    .filter((i) => (variant === 'stat' ? !!trimmed(i?.value) : !!trimmed(i?.title)))
    .map((i) => ({
      ...i,
      value: trimmed(i.value),
      icon: trimmed(i.icon),
      title: trimmed(i.title),
      text: trimmed(i.text),
      url: trimmed(i.url),
      linkLabel: trimmed(i.linkLabel),
      tone: i.tone ?? 'primary',
    }));
}

const TILE_HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** A tile or group colour that may go into a style binding; '' for anything else. */
export function tileColor(value: string | undefined): string {
  const v = value?.trim() ?? '';
  return TILE_HEX.test(v) ? v : '';
}

/** A group as a tiles section with source 'groups' reads it (GroupModel fields, legacy docs coalesced). */
export interface TileGroup {
  okey: string;
  name: string;
  subTitle?: string;
  color?: string;
  isArchived?: boolean;
  kind?: string;
}

/** A group card: an image tile whose picture is the group's avatar (`avatarKey`, rendered through the avatar pipe). */
export type GroupTileItem = TileItem & { avatarKey: string };

/**
 * One image tile per public group (its content page `<okey>_content` is public), sorted by name: the name, the
 * `subTitle` as text, the group colour, linked to the content page. Archived groups and chats/pinboards are left
 * out. The website builds the same cards (`groupTileItems` in cms-website-render), there in website-menu order.
 */
export function groupTiles(groups: TileGroup[], publicKeys: ReadonlySet<string>, linkLabel: string | undefined): GroupTileItem[] {
  return groups
    .filter((g) => !g.isArchived && (g.kind ?? 'group') === 'group' && publicKeys.has(g.okey) && !!g.name?.trim())
    .sort((a, b) => a.name.localeCompare(b.name, 'de'))
    .map((g) => ({
      title: g.name.trim(),
      text: g.subTitle?.trim() || undefined,
      url: `/private/${g.okey}_content`,
      linkLabel: linkLabel?.trim() || undefined,
      tone: 'primary' as const,
      imageFit: 'contain' as const,
      color: tileColor(g.color),
      avatarKey: `group.${g.okey}`,
    }));
}

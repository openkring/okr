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

/** Column count from md up, clamped to 1–4 (mobile collapses to one column in CSS). */
export function tilesColumns(columns: number | undefined): number {
  const cols = Math.round(columns ?? TILES_CONFIG_SHAPE.columns);
  return Number.isFinite(cols) ? Math.min(4, Math.max(1, cols)) : TILES_CONFIG_SHAPE.columns;
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
      tone: i.tone ?? 'primary',
    }));
}

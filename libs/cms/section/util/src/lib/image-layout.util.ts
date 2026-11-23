import { IMAGE_LAYOUT_IDS, SIDE_BY_SIDE_LAYOUT, type ImageLayoutId } from '@okr/shared-models';

// the layout ids and the placement rule live in shared-models (spec 1.173: the functions and the website need them too)
export { IMAGE_LAYOUT_IDS, SIDE_BY_SIDE_LAYOUT, STACKED_LAYOUT, articleImagePosition, type ImageLayoutId } from '@okr/shared-models';

export type ImageLayoutGroup = 2 | 3 | 4 | 5;

/** The layouts offered per image count (group 5 = five or more); the first id of a group is its default. */
export const IMAGE_LAYOUT_GROUPS: Record<ImageLayoutGroup, ImageLayoutId[]> = {
  2: ['pair', 'big-small', 'stacked', 'side-by-side', 'slider'],
  3: ['big-left', 'big-top', 'big-right', 'row', 'stacked', 'side-by-side', 'slider'],
  4: ['grid', 'big-left', 'big-top', 'filmstrip', 'stacked', 'side-by-side', 'slider'],
  5: ['mosaic', 'big-grid', 'grid', 'stacked', 'slider'],
};

export function isImageLayoutId(value: unknown): value is ImageLayoutId {
  return (IMAGE_LAYOUT_IDS as readonly unknown[]).includes(value);
}

/** The layout group of an image count; undefined below 2 images (no layout). */
export function imageLayoutGroup(count: number): ImageLayoutGroup | undefined {
  if (count < 2) return undefined;
  return count >= 5 ? 5 : (count as 2 | 3 | 4);
}

/** The layouts offered for `count` images (the picker's cards); `[]` below 2 images. */
export function imageLayoutsFor(count: number): ImageLayoutId[] {
  const group = imageLayoutGroup(count);
  return group ? [...IMAGE_LAYOUT_GROUPS[group]] : [];
}

/**
 * The layout to render for a stored id and the current image count (decision 2):
 * fewer than 2 images → undefined, except a stored `side-by-side` with one image (kept); absent → `slider`; valid for the count → used; defined only for a smaller group →
 * kept (its pattern repeats, see `imageLayoutTiles`); otherwise (too large for the count, or an unknown id) → the
 * default of the count's group.
 */
export function resolveImageLayout(stored: string | undefined, count: number): ImageLayoutId | undefined {
  const group = imageLayoutGroup(count);
  if (!group) return count === 1 && stored === SIDE_BY_SIDE_LAYOUT ? SIDE_BY_SIDE_LAYOUT : undefined;
  if (!stored) return 'slider';
  if (isImageLayoutId(stored)) {
    for (let g = group; g >= 2; g--) {
      if (IMAGE_LAYOUT_GROUPS[g as ImageLayoutGroup].includes(stored)) return stored;
    }
  }
  return IMAGE_LAYOUT_GROUPS[group][0];
}

// ------------------------------------------------- tiles ------------------------------------------------------

/**
 * One image's place in a layout's CSS grid: `column` and `row` are 1-based CSS grid lines (`grid-column:
 * column / span colSpan`). The grid has `IMAGE_LAYOUT_COLUMNS` columns and square cells (a row unit is as high as a
 * column is wide), so `colSpan / rowSpan` is the tile's aspect ratio.
 */
export interface ImageTile { index: number; column: number; row: number; colSpan: number; rowSpan: number }

/** Twelve columns: every row splits evenly into 1, 2, 3 or 4 tiles. */
export const IMAGE_LAYOUT_COLUMNS = 12;

/** A tile relative to its pattern block: 0-based column/row offsets. */
interface PatternTile { dx: number; dy: number; colSpan: number; rowSpan: number }
const t = (dx: number, dy: number, colSpan: number, rowSpan: number): PatternTile => ({ dx, dy, colSpan, rowSpan });

/**
 * The fixed patterns of the layouts of groups 2–4, per group. A pattern holds at most as many tiles as its group;
 * it repeats downward for more images (decision 2, spec §5 «the layout repeats»).
 */
const PATTERNS: Partial<Record<ImageLayoutId, Partial<Record<2 | 3 | 4, PatternTile[]>>>> = {
  'pair': { 2: [t(0, 0, 6, 4), t(6, 0, 6, 4)] },
  'big-small': { 2: [t(0, 0, 8, 6), t(8, 0, 4, 6)] },
  'stacked': { 2: [t(0, 0, 12, 8)] },
  'big-left': {
    3: [t(0, 0, 8, 8), t(8, 0, 4, 4), t(8, 4, 4, 4)],
    4: [t(0, 0, 9, 9), t(9, 0, 3, 3), t(9, 3, 3, 3), t(9, 6, 3, 3)],
  },
  'big-right': { 3: [t(4, 0, 8, 8), t(0, 0, 4, 4), t(0, 4, 4, 4)] },
  'big-top': {
    3: [t(0, 0, 12, 8), t(0, 8, 6, 4), t(6, 8, 6, 4)],
    4: [t(0, 0, 12, 8), t(0, 8, 4, 4), t(4, 8, 4, 4), t(8, 8, 4, 4)],
  },
  'row': { 3: [t(0, 0, 4, 4), t(4, 0, 4, 4), t(8, 0, 4, 4)] },
  'grid': { 4: [t(0, 0, 6, 4), t(6, 0, 6, 4), t(0, 4, 6, 4), t(6, 4, 6, 4)] },
  'filmstrip': { 4: [t(0, 0, 3, 3), t(3, 0, 3, 3), t(6, 0, 3, 3), t(9, 0, 3, 3)] },
  // only the schematic preview reads these tiles: the renderers draw side-by-side as a flex row of uncropped images
  'side-by-side': {
    2: [t(1, 0, 4, 4), t(7, 0, 4, 4)],
    3: [t(0, 0, 4, 4), t(4, 0, 4, 4), t(8, 0, 4, 4)],
    4: [t(0, 0, 3, 3), t(3, 0, 3, 3), t(6, 0, 3, 3), t(9, 0, 3, 3)],
  },
};

/** Row heights of a row of `n` equal tiles: one wide tile is 2:1, two are 3:2, three or four are square. */
const EVEN_ROW_SPAN: Record<number, number> = { 1: 6, 2: 4, 3: 4, 4: 3 };

/** A row of `n` (1–4) equal tiles. */
function evenRow(n: number): PatternTile[] {
  const colSpan = IMAGE_LAYOUT_COLUMNS / n;
  return Array.from({ length: n }, (_, i) => t(i * colSpan, 0, colSpan, EVEN_ROW_SPAN[n]));
}

/** Places pattern blocks one below the other, numbering the images in order. */
class TileWriter {
  public readonly tiles: ImageTile[] = [];
  private row = 1;

  public place(block: PatternTile[]): void {
    const start = this.tiles.length;
    block.forEach((p, i) => this.tiles.push({ index: start + i, column: p.dx + 1, row: this.row + p.dy, colSpan: p.colSpan, rowSpan: p.rowSpan }));
    this.row += Math.max(0, ...block.map((p) => p.dy + p.rowSpan));
  }

  /** Rows of `size` equal tiles (or the alternating sizes), the last row split evenly over what is left. */
  public rows(count: number, sizes: number[]): void {
    for (let k = 0; this.tiles.length < count; k++) {
      this.place(evenRow(Math.min(sizes[k % sizes.length], count - this.tiles.length)));
    }
  }
}

/** The layouts of five or more images: generated for any count. */
function generated(layout: ImageLayoutId, count: number, w: TileWriter): void {
  if (layout === 'stacked') {
    w.rows(count, [1]); // one full-width image per row
    return;
  }
  if (layout === 'mosaic') {
    w.rows(count, [2, 3]); // decision 4: rows alternate two and three equal tiles
    return;
  }
  // big-grid: one large tile with two beside it, then rows of three
  if (layout === 'big-grid' && count >= 3) w.place([t(0, 0, 8, 8), t(8, 0, 4, 4), t(8, 4, 4, 4)]);
  w.rows(count, [3]); // grid: rows of three
}

/**
 * The grid tiles of `count` images in `layout` (not used for `slider`, which renders the carousel). Every index
 * `0..count-1` appears exactly once and no two tiles overlap. A fixed pattern (groups 2–4) is taken from the largest
 * group up to `count` that defines it and repeats downward; a remainder smaller than the pattern uses the layout's
 * pattern for that many images, if it has one, else a row of equal tiles. The layouts of five or more (`mosaic`,
 * `big-grid`, `grid`) are generated row by row. A layout without a pattern for the count falls back to rows of three.
 */
export function imageLayoutTiles(layout: ImageLayoutId, count: number): { columns: number; tiles: ImageTile[] } {
  const w = new TileWriter();
  if (count <= 0) return { columns: IMAGE_LAYOUT_COLUMNS, tiles: [] };
  const patterns = PATTERNS[layout] ?? {};
  const fixedGroup = ([4, 3, 2] as const).find((g) => g <= count && patterns[g]);
  if (!fixedGroup || (count >= 5 && IMAGE_LAYOUT_GROUPS[5].includes(layout))) {
    generated(layout, count, w);
  } else {
    const pattern = patterns[fixedGroup] ?? [];
    while (count - w.tiles.length >= pattern.length) w.place(pattern);
    const rest = count - w.tiles.length;
    if (rest > 0) {
      const own = patterns[rest as 2 | 3 | 4];
      w.place(own?.length === rest ? own : evenRow(rest));
    }
  }
  return { columns: IMAGE_LAYOUT_COLUMNS, tiles: w.tiles };
}

import { describe, expect, it } from 'vitest';
import { ViewPosition } from '@okr/shared-models';

import {
  IMAGE_LAYOUT_COLUMNS, IMAGE_LAYOUT_GROUPS, IMAGE_LAYOUT_IDS, ImageLayoutId, ImageTile, articleImagePosition,
  imageLayoutGroup, imageLayoutTiles, imageLayoutsFor, resolveImageLayout,
} from './image-layout.util';

/** Every index 0..count-1 exactly once, every tile inside the grid, no two tiles sharing a cell. */
function expectValidTiling(columns: number, tiles: ImageTile[], count: number): void {
  expect(tiles.map((t) => t.index).sort((a, b) => a - b)).toEqual([...Array(count).keys()]);
  const cells = new Set<string>();
  for (const t of tiles) {
    expect(t.column).toBeGreaterThanOrEqual(1);
    expect(t.row).toBeGreaterThanOrEqual(1);
    expect(t.colSpan).toBeGreaterThanOrEqual(1);
    expect(t.rowSpan).toBeGreaterThanOrEqual(1);
    expect(t.column + t.colSpan - 1).toBeLessThanOrEqual(columns);
    for (let c = t.column; c < t.column + t.colSpan; c++) {
      for (let r = t.row; r < t.row + t.rowSpan; r++) {
        const cell = `${c}/${r}`;
        expect(cells.has(cell), `tile ${t.index} overlaps at ${cell}`).toBe(false);
        cells.add(cell);
      }
    }
  }
}

describe('image layout groups', () => {
  it('lists the layouts per image count; the first is the default, every group ends with the slider', () => {
    expect(IMAGE_LAYOUT_GROUPS[2]).toEqual(['pair', 'big-small', 'stacked', 'slider']);
    expect(IMAGE_LAYOUT_GROUPS[3]).toEqual(['big-left', 'big-top', 'big-right', 'row', 'slider']);
    expect(IMAGE_LAYOUT_GROUPS[4]).toEqual(['grid', 'big-left', 'big-top', 'filmstrip', 'slider']);
    expect(IMAGE_LAYOUT_GROUPS[5]).toEqual(['mosaic', 'big-grid', 'grid', 'slider']);
  });

  it('IMAGE_LAYOUT_IDS holds every id of every group once', () => {
    const all = new Set(Object.values(IMAGE_LAYOUT_GROUPS).flat());
    expect(new Set(IMAGE_LAYOUT_IDS)).toEqual(all);
    expect(IMAGE_LAYOUT_IDS.length).toBe(all.size);
  });

  it('imageLayoutGroup: none below 2 images, 5 for five or more', () => {
    expect(imageLayoutGroup(0)).toBeUndefined();
    expect(imageLayoutGroup(1)).toBeUndefined();
    expect(imageLayoutGroup(2)).toBe(2);
    expect(imageLayoutGroup(3)).toBe(3);
    expect(imageLayoutGroup(4)).toBe(4);
    expect(imageLayoutGroup(5)).toBe(5);
    expect(imageLayoutGroup(12)).toBe(5);
  });

  it('imageLayoutsFor: the group of the count, a copy', () => {
    expect(imageLayoutsFor(1)).toEqual([]);
    expect(imageLayoutsFor(3)).toEqual(IMAGE_LAYOUT_GROUPS[3]);
    expect(imageLayoutsFor(9)).toEqual(IMAGE_LAYOUT_GROUPS[5]);
    imageLayoutsFor(2).push('mosaic');
    expect(IMAGE_LAYOUT_GROUPS[2]).not.toContain('mosaic');
  });
});

describe('resolveImageLayout', () => {
  it('fewer than 2 images: no layout', () => {
    expect(resolveImageLayout('pair', 0)).toBeUndefined();
    expect(resolveImageLayout(undefined, 1)).toBeUndefined();
  });

  it('absent: the slider (every existing article stays unchanged)', () => {
    expect(resolveImageLayout(undefined, 2)).toBe('slider');
    expect(resolveImageLayout(undefined, 7)).toBe('slider');
    expect(resolveImageLayout('', 3)).toBe('slider');
  });

  it('valid for the count: used', () => {
    expect(resolveImageLayout('big-small', 2)).toBe('big-small');
    expect(resolveImageLayout('row', 3)).toBe('row');
    expect(resolveImageLayout('filmstrip', 4)).toBe('filmstrip');
    expect(resolveImageLayout('big-grid', 8)).toBe('big-grid');
    expect(resolveImageLayout('slider', 5)).toBe('slider');
  });

  it('too large for the count (images deleted): the default of the smaller group, never an empty slot', () => {
    expect(resolveImageLayout('grid', 3)).toBe('big-left');
    expect(resolveImageLayout('filmstrip', 3)).toBe('big-left');
    expect(resolveImageLayout('mosaic', 4)).toBe('grid');
    expect(resolveImageLayout('row', 2)).toBe('pair');
    expect(resolveImageLayout('big-left', 2)).toBe('pair');
  });

  it('defined only for a smaller group: kept, its pattern repeats', () => {
    expect(resolveImageLayout('pair', 3)).toBe('pair');
    expect(resolveImageLayout('row', 4)).toBe('row');
    expect(resolveImageLayout('big-left', 7)).toBe('big-left');
    expect(resolveImageLayout('stacked', 6)).toBe('stacked');
  });

  it('an unknown id (typo, future id): the default of the count', () => {
    expect(resolveImageLayout('xyz', 2)).toBe('pair');
    expect(resolveImageLayout('xyz', 3)).toBe('big-left');
    expect(resolveImageLayout('xyz', 4)).toBe('grid');
    expect(resolveImageLayout('hexagon', 9)).toBe('mosaic');
  });
});

describe('imageLayoutTiles', () => {
  const tiled = IMAGE_LAYOUT_IDS.filter((id) => id !== 'slider');
  const groupCounts = [2, 3, 4, 5] as const;

  for (const count of groupCounts) {
    for (const layout of IMAGE_LAYOUT_GROUPS[count].filter((id) => id !== 'slider')) {
      it(`${layout} with ${count} images covers every image once, without overlap`, () => {
        const { columns, tiles } = imageLayoutTiles(layout, count);
        expect(columns).toBe(IMAGE_LAYOUT_COLUMNS);
        expectValidTiling(columns, tiles, count);
      });
    }
  }

  for (const layout of tiled) {
    it(`${layout} with 7 images repeats downward and loses no image`, () => {
      const { columns, tiles } = imageLayoutTiles(layout, 7);
      expectValidTiling(columns, tiles, 7);
    });
  }

  it('covers every count from 1 to 13 for every layout', () => {
    for (const layout of IMAGE_LAYOUT_IDS) {
      for (let count = 1; count <= 13; count++) {
        const { columns, tiles } = imageLayoutTiles(layout, count);
        expectValidTiling(columns, tiles, count);
      }
    }
  });

  it('no images: no tiles', () => {
    expect(imageLayoutTiles('grid', 0).tiles).toEqual([]);
  });

  it('big-left with 3: one large tile on the left, two stacked on the right', () => {
    expect(imageLayoutTiles('big-left', 3).tiles).toEqual([
      { index: 0, column: 1, row: 1, colSpan: 8, rowSpan: 8 },
      { index: 1, column: 9, row: 1, colSpan: 4, rowSpan: 4 },
      { index: 2, column: 9, row: 5, colSpan: 4, rowSpan: 4 },
    ]);
  });

  it('big-right with 3 mirrors big-left', () => {
    expect(imageLayoutTiles('big-right', 3).tiles).toEqual([
      { index: 0, column: 5, row: 1, colSpan: 8, rowSpan: 8 },
      { index: 1, column: 1, row: 1, colSpan: 4, rowSpan: 4 },
      { index: 2, column: 1, row: 5, colSpan: 4, rowSpan: 4 },
    ]);
  });

  it('pair with 3: the pair, then the last image across the full width', () => {
    expect(imageLayoutTiles('pair', 3).tiles).toEqual([
      { index: 0, column: 1, row: 1, colSpan: 6, rowSpan: 4 },
      { index: 1, column: 7, row: 1, colSpan: 6, rowSpan: 4 },
      { index: 2, column: 1, row: 5, colSpan: 12, rowSpan: 6 },
    ]);
  });

  it('filmstrip with 4: one row of four', () => {
    const { tiles } = imageLayoutTiles('filmstrip', 4);
    expect(tiles.every((t) => t.row === 1)).toBe(true);
    expect(tiles.map((t) => t.column)).toEqual([1, 4, 7, 10]);
  });

  it('mosaic alternates rows of two and three', () => {
    const { tiles } = imageLayoutTiles('mosaic', 7);
    const rows = [...new Set(tiles.map((t) => t.row))];
    expect(rows.map((r) => tiles.filter((t) => t.row === r).length)).toEqual([2, 3, 2]);
  });

  it('big-left with 7: the four-image pattern, then the three-image pattern below it', () => {
    const { tiles } = imageLayoutTiles('big-left', 7);
    expect(tiles[0]).toEqual({ index: 0, column: 1, row: 1, colSpan: 9, rowSpan: 9 });
    expect(tiles[4]).toEqual({ index: 4, column: 1, row: 10, colSpan: 8, rowSpan: 8 });
  });
});

describe('articleImagePosition', () => {
  const positions = [ViewPosition.None, ViewPosition.Top, ViewPosition.Bottom, ViewPosition.Left, ViewPosition.Right];

  it('no images: none', () => {
    expect(articleImagePosition(ViewPosition.Left, 0, undefined)).toBe(ViewPosition.None);
    expect(articleImagePosition(ViewPosition.Top, 0, 'pair')).toBe(ViewPosition.None);
  });

  it('one image: the stored position (or none), with or without a layout (layout ignored but kept)', () => {
    for (const p of positions) {
      expect(articleImagePosition(p, 1, undefined)).toBe(p);
      expect(articleImagePosition(p, 1, 'big-left')).toBe(p);
    }
    expect(articleImagePosition(undefined, 1, undefined)).toBe(ViewPosition.None);
  });

  it('several images without a layout: always on top, whatever is stored (as today)', () => {
    for (const p of positions) expect(articleImagePosition(p, 3, undefined)).toBe(ViewPosition.Top);
    expect(articleImagePosition(undefined, 3, undefined)).toBe(ViewPosition.Top);
  });

  it('several images with a layout: top or bottom only', () => {
    expect(articleImagePosition(ViewPosition.Bottom, 3, 'row')).toBe(ViewPosition.Bottom);
    expect(articleImagePosition(ViewPosition.Bottom, 3, 'slider')).toBe(ViewPosition.Bottom);
    expect(articleImagePosition(ViewPosition.Top, 3, 'row')).toBe(ViewPosition.Top);
    expect(articleImagePosition(ViewPosition.Left, 3, 'row')).toBe(ViewPosition.Top);
    expect(articleImagePosition(ViewPosition.Right, 3, 'row')).toBe(ViewPosition.Top);
    expect(articleImagePosition(ViewPosition.None, 3, 'row')).toBe(ViewPosition.Top);
    expect(articleImagePosition(undefined, 3, 'row')).toBe(ViewPosition.Top);
  });
});

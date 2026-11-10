import { describe, expect, it } from 'vitest';

import { TileItem, TILES_CONFIG_SHAPE } from '@okr/shared-models';
import { tilesColumns, validTiles, withTilesDefaults } from './tiles-config.util';

describe('tilesColumns', () => {
  it('clamps to 1-4 and defaults to 3', () => {
    expect(tilesColumns(0)).toBe(1);
    expect(tilesColumns(9)).toBe(4);
    expect(tilesColumns(2)).toBe(2);
    expect(tilesColumns(undefined)).toBe(3);
    expect(tilesColumns(NaN)).toBe(3);
  });
});

describe('validTiles', () => {
  it('drops stat tiles without a value', () => {
    expect(validTiles([{ tone: 'primary' }], 'stat')).toEqual([]);
  });

  it('drops card tiles without a title', () => {
    expect(validTiles([{ value: '1', tone: 'primary' }], 'card')).toEqual([]);
  });

  it('trims and coalesces tone to primary', () => {
    const item = { value: ' 1917 ', title: 'Gegründet', tone: undefined as never } as TileItem;
    expect(validTiles([item], 'stat')[0]).toMatchObject({ value: '1917', title: 'Gegründet', tone: 'primary' });
  });

  it('keeps secondary tone and handles undefined input', () => {
    expect(validTiles([{ title: 'A', tone: 'secondary' }], 'card')[0].tone).toBe('secondary');
    expect(validTiles(undefined, 'card')).toEqual([]);
  });
});

describe('withTilesDefaults', () => {
  it('fills a missing config from the shape', () => {
    expect(withTilesDefaults(undefined)).toMatchObject({ variant: TILES_CONFIG_SHAPE.variant, columns: 3, items: [] });
  });

  it('keeps given values', () => {
    expect(withTilesDefaults({ variant: 'stat', columns: 2, items: [], kicker: 'K' })).toMatchObject({ variant: 'stat', columns: 2, kicker: 'K' });
  });
});

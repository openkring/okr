import { describe, expect, it } from 'vitest';

import { TileItem, TILES_CONFIG_SHAPE } from '@okr/shared-models';
import { groupTiles, tileColor, tilesColumns, validTiles, withTilesDefaults } from './tiles-config.util';

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
    expect(withTilesDefaults({ variant: 'stat', columns: 2, items: [{ title: 'K', tone: 'primary' }] })).toMatchObject({ variant: 'stat', columns: 2, items: [{ title: 'K' }] });
  });
});

describe('groupTiles', () => {
  const groups = [
    { okey: 'oase', name: 'Oase Kirchbühl', subTitle: ' Und wo …? ', color: '#C5C664' },
    { okey: 'kiss', name: 'KISS Stäfa', color: 'red' },
    { okey: 'old', name: 'Alt', isArchived: true },
    { okey: 'chat1', name: 'Chat', kind: 'chat' },
    { okey: 'priv', name: 'Privat' },
  ];
  const publicKeys = new Set(['oase', 'kiss', 'old', 'chat1']);

  it('makes sorted, linked logo cards of the public groups only', () => {
    const tiles = groupTiles(groups, publicKeys, 'mehr …');
    expect(tiles.map((t) => t.title)).toEqual(['KISS Stäfa', 'Oase Kirchbühl']);
    expect(tiles[1]).toMatchObject({ text: 'Und wo …?', color: '#C5C664', url: '/private/oase_content', linkLabel: 'mehr …', avatarKey: 'group.oase', imageFit: 'contain' });
    expect(tiles[0].color).toBe('');
  });
});

describe('tileColor', () => {
  it('passes hex colours only', () => {
    expect(tileColor('#59A3BF')).toBe('#59A3BF');
    expect(tileColor('url(x)')).toBe('');
    expect(tileColor(undefined)).toBe('');
  });
});

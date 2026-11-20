import { describe, expect, it } from 'vitest';
import type { PageModel } from '@okr/shared-models';

import { groupTileItems, safeHexColor, type PublicGroup } from './group-tiles';
import { mapSection, type SectionDoc } from './section-mapper';

const group = (key: string, over: Partial<PublicGroup> = {}): PublicGroup =>
  ({ key, name: key.toUpperCase(), subTitle: `Teaser ${key}`, color: '#59A3BF', image: `tenant/la21staefa/group/${key}/logo.png`, ...over });
const page = (isPrivate: boolean) => ({ isPrivate } as PageModel);

describe('groupTileItems', () => {
  const links = [{ key: 'kiss', label: 'KISS', slug: 'kiss' }, { key: 'oase', label: 'Oase', slug: 'oase' }, { key: 'zb', label: 'ZB', slug: 'zb' }];
  const groups = new Map([['kiss', group('kiss')], ['oase', group('oase', { color: 'red;background:url(x)' })], ['zb', group('zb')]]);
  const pages = new Map([['kiss_content', page(false)], ['oase_content', page(false)], ['zb_content', page(true)]]);

  it('makes one linked logo card per public group, in tree order', () => {
    const tiles = groupTileItems(links, groups, pages);
    expect(tiles.map((t) => t.title)).toEqual(['KISS', 'OASE']);
    expect(tiles[0]).toMatchObject({ url: '/kiss', text: 'Teaser kiss', color: '#59A3BF', imageFit: 'contain' });
    expect(tiles[0].imageSrc).toContain('tenant/la21staefa/group/kiss/logo.png');
  });

  it('drops an unsafe colour and skips private pages and unknown groups', () => {
    expect(groupTileItems(links, groups, pages)[1].color).toBe('');
    expect(groupTileItems(links, undefined, pages)).toEqual([]);
  });

  it('accepts only hex colours', () => {
    expect(safeHexColor('#abc')).toBe('#abc');
    expect(safeHexColor('blue')).toBe('');
  });
});

describe('mapSection tiles from groups', () => {
  const tile = groupTileItems([{ key: 'kiss', label: 'KISS', slug: 'kiss' }], new Map([['kiss', group('kiss')]]), new Map([['kiss_content', page(false)]]));
  const section = { type: 'tiles', title: 'Projektgruppen', properties: { source: 'groups', layout: 'list', linkLabel: 'mehr …', variant: 'card', columns: 3, items: [{ title: 'ignored', tone: 'primary' }] } } as unknown as SectionDoc;

  it('uses the group cards with the section link label and layout, ignoring the inline items', () => {
    const mapped = mapSection('s', section, new Map(), (h) => h, 'de', undefined, tile) as { variant: string; layout: string; items: { title: string; linkLabel: string }[] };
    expect(mapped.variant).toBe('image');
    expect(mapped.layout).toBe('list');
    expect(mapped.items).toEqual([expect.objectContaining({ title: 'KISS', linkLabel: 'mehr …' })]);
  });
});

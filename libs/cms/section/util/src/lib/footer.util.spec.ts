import { describe, expect, it } from 'vitest';

import { FOOTER_CONFIG_SHAPE, FOOTER_ITEM_SHAPE, FooterConfig } from '@okr/shared-models';

import { footerBlocks, footerColumnCount, footerVisibleColumns, isExternalFooterUrl, isFooterUrl, newFooterItem, normalizeFooterConfig } from './footer.util';

describe('normalizeFooterConfig', () => {
  it('fills a missing config with three empty columns', () => {
    const config = normalizeFooterConfig(undefined);
    expect(config.columns).toEqual([{ items: [] }, { items: [] }, { items: [] }]);
    expect(config.showBottomLine).toBe(true);
  });

  it('pads short column lists and completes items', () => {
    const config = normalizeFooterConfig({ columns: [{ items: [{ type: 'title', label: 'A' } as never]}] });
    expect(config.columns).toHaveLength(3);
    expect(config.columns[0].items[0]).toEqual({ ...FOOTER_ITEM_SHAPE, type: 'title', label: 'A' });
  });
});

describe('footerVisibleColumns', () => {
  const config: FooterConfig = {
    ...FOOTER_CONFIG_SHAPE,
    columns: [{ items: [newFooterItem('title')] }, { items: [newFooterItem('link')] }, { items: [newFooterItem('logo')] }],
  };

  it('shows the first columnCount columns and keeps the hidden ones in the config', () => {
    expect(footerVisibleColumns({ ...config, columnCount: 2 }).map(c => c.items[0].type)).toEqual(['title', 'link']);
    expect(footerVisibleColumns({ ...config, columnCount: 1 })).toHaveLength(1);
  });

  it('clamps a broken column count', () => {
    expect(footerColumnCount({ columnCount: 7 })).toBe(3);
    expect(footerColumnCount({ columnCount: 0 })).toBe(1);
    expect(footerColumnCount({ columnCount: NaN })).toBe(3);
  });
});

describe('isFooterUrl', () => {
  it('accepts https, mailto, tel and internal routes', () => {
    for (const url of ['https://seeclub.org', 'mailto:a@b.ch', 'tel:+41441234567', '/private/home']) {
      expect(isFooterUrl(url)).toBe(true);
    }
  });

  it('rejects scripts, data, plain http and protocol-relative urls', () => {
    for (const url of ['javascript:alert(1)', 'data:text/html,x', 'http://x.ch', '//evil.ch', 'impressum.html', '']) {
      expect(isFooterUrl(url)).toBe(false);
    }
  });

  it('marks only https links as external', () => {
    expect(isExternalFooterUrl('https://x.ch')).toBe(true);
    expect(isExternalFooterUrl('mailto:a@b.ch')).toBe(false);
    expect(isExternalFooterUrl('/private/home')).toBe(false);
  });
});

describe('footerBlocks', () => {
  const logo = (image: string) => ({ ...newFooterItem('logo'), image });

  it('puts consecutive logos into one row and keeps the order', () => {
    const blocks = footerBlocks([newFooterItem('title'), logo('a.png'), logo('b.png'), newFooterItem('link'), logo('c.png')]);
    expect(blocks.map(b => (b.kind === 'logos' ? `logos:${b.items.length}` : b.item.type))).toEqual(['title', 'logos:2', 'link', 'logos:1']);
  });

  it('drops logos without an image', () => {
    expect(footerBlocks([logo(''), newFooterItem('text')]).map(b => b.kind)).toEqual(['item']);
  });
});

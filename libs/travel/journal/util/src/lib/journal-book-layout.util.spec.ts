import { describe, expect, it } from 'vitest';
import { BookPageOverride } from '@okr/shared-models';
import { ImageView } from './journal-view.util';
import {
  MARGIN,
  PAGE_H,
  PAGE_W,
  PRINT_FILL_LONG_PX,
  PRINT_FILL_SHORT_PX,
  albumPages,
  autoLayout,
  effectiveDpi,
  printScale,
  templateBoxes,
} from './journal-book-layout.util';

function img(key: string, width: number, height: number): ImageView {
  return { key, authorKey: '', width, height, path2048: '', path400: '', localIdentifier: '' } as ImageView;
}
const L = (k: string) => img(k, 4000, 3000);
const P = (k: string) => img(k, 3000, 4000);

describe('journal-book-layout', () => {
  it('templateBoxes gives the frame count of each template', () => {
    expect(templateBoxes('full', 3)).toHaveLength(1);
    expect(templateBoxes('two-portrait', 3)).toHaveLength(2);
    expect(templateBoxes('two-landscape', 3)).toHaveLength(2);
    expect(templateBoxes('hero-2', 3)).toHaveLength(3);
    expect(templateBoxes('hero-3', 3)).toHaveLength(4);
    for (const t of ['two-portrait', 'two-landscape', 'hero-2', 'hero-3'] as const) {
      for (const b of templateBoxes(t, 3)) {
        expect(b.x).toBeGreaterThanOrEqual(MARGIN);
        expect(b.y).toBeGreaterThanOrEqual(MARGIN);
        expect(b.x + b.w).toBeLessThanOrEqual(PAGE_W - MARGIN + 1e-9);
        expect(b.y + b.h).toBeLessThanOrEqual(PAGE_H - MARGIN + 1e-9);
      }
    }
    expect(templateBoxes('full', 3)[0]).toEqual({ x: -3, y: -3, w: 303, h: 216 });
  });

  it('two portraits in a row become two-portrait', () => {
    expect(autoLayout([P('a'), P('b')])).toEqual([{ template: 'two-portrait', imageKeys: ['a', 'b'] }]);
  });
  it('a landscape followed by two photos becomes hero-2', () => {
    expect(autoLayout([L('a'), P('b'), P('c')])).toEqual([{ template: 'hero-2', imageKeys: ['a', 'b', 'c'] }]);
  });
  it('a landscape followed by three becomes hero-3', () => {
    expect(autoLayout([L('a'), P('b'), L('c'), P('d')])).toEqual([{ template: 'hero-3', imageKeys: ['a', 'b', 'c', 'd'] }]);
  });
  it('a single landscape becomes full', () => {
    expect(autoLayout([L('a')])).toEqual([{ template: 'full', imageKeys: ['a'] }]);
  });
  it('autoLayout is deterministic', () => {
    const imgs = [L('a'), P('b'), P('c'), L('d'), L('e'), P('f'), L('g')];
    expect(autoLayout(imgs)).toEqual(autoLayout(imgs));
  });

  it('overrides drop unknown and hidden images and empty pages', () => {
    const images = [L('a'), L('b'), L('c')];
    const overrides: BookPageOverride[] = [
      { template: 'two-landscape', imageKeys: ['a', 'x'] },
      { template: 'two-landscape', imageKeys: ['b', 'zzz'] },
    ];
    const pages = albumPages(images, overrides, new Set(['b']));
    expect(pages[0]).toEqual({ template: 'two-landscape', imageKeys: ['a'] });
    expect(pages.some((p) => p.imageKeys.length === 0)).toBe(false);
    expect(pages.flatMap((p) => p.imageKeys)).toEqual(['a', 'c']);
  });
  it('images missing from the overrides are appended by autoLayout after them', () => {
    const images = [L('a'), L('b'), L('c')];
    const pages = albumPages(images, [{ template: 'full', imageKeys: ['b'] }], new Set());
    expect(pages[0]).toEqual({ template: 'full', imageKeys: ['b'] });
    expect(pages.slice(1).flatMap((p) => p.imageKeys).sort()).toEqual(['a', 'c']);
  });
  it('without overrides albumPages is autoLayout of the visible images', () => {
    expect(albumPages([L('a'), L('b')], undefined, new Set(['b']))).toEqual([{ template: 'full', imageKeys: ['a'] }]);
  });

  describe('effectiveDpi', () => {
    const full = templateBoxes('full', 3)[0];
    it('4032x3024 scaled by printScale gives >= 300 dpi in full fill', () => {
      const s = printScale(4032, 3024);
      const px = { width: Math.round(4032 * s), height: Math.round(3024 * s) };
      expect(px.width).toBe(PRINT_FILL_LONG_PX);
      expect(effectiveDpi(px, full, 'fill')).toBeGreaterThanOrEqual(300);
    });
    it('3600x2400 in full fill gives < 300', () => {
      const d = effectiveDpi({ width: 3600, height: 2400 }, full, 'fill');
      expect(d).toBeLessThan(300);
      expect(Math.round(d)).toBe(282);
    });
    it('2048 px wide in full is below 200', () => {
      expect(effectiveDpi({ width: 2048, height: 1365 }, full, 'fill')).toBeLessThan(200);
    });
    it('fill uses the cropped side, whole the limiting side', () => {
      const box = { x: 0, y: 0, w: 254, h: 254 }; // 10 in square
      const px = { width: 3000, height: 1000 };
      expect(effectiveDpi(px, box, 'fill')).toBeCloseTo(100); // height must cover
      expect(effectiveDpi(px, box, 'whole')).toBeCloseTo(300); // width limits
    });
    it('printScale never upscales', () => {
      expect(printScale(1000, 800)).toBe(1);
      expect(PRINT_FILL_SHORT_PX).toBe(2551);
    });
  });
});

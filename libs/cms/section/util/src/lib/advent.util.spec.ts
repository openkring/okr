import { IMAGE_CONFIG_SHAPE, ImageConfig } from '@okr/shared-models';

import {
  ADVENT_DOOR_COUNT, adventImageName, adventLinkKind, adventStorageKey, coverBox, createAdventDoors,
  generateAdventLayout, isDoorUnlocked, openDoorsOnLoad, parseOpenedUpTo, rearrangeAdventDoors, resolveAdventBackground
} from './advent.util';

const img = (url: string, label = ''): ImageConfig => ({ ...IMAGE_CONFIG_SHAPE, url, label });

describe('isDoorUnlocked', () => {
  it('locks every door before 1 December', () => {
    expect(isDoorUnlocked(1, 2026, new Date(2026, 10, 30, 23, 59))).toBe(false);
  });
  it('unlocks door n at local midnight of n December', () => {
    expect(isDoorUnlocked(5, 2026, new Date(2026, 11, 4, 23, 59))).toBe(false);
    expect(isDoorUnlocked(5, 2026, new Date(2026, 11, 5, 0, 0))).toBe(true);
  });
  it('keeps a past year fully open and a future year locked', () => {
    expect(isDoorUnlocked(25, 2025, new Date(2026, 0, 10))).toBe(true);
    expect(isDoorUnlocked(1, 2027, new Date(2026, 11, 24))).toBe(false);
  });
});

describe('adventStorageKey / parseOpenedUpTo', () => {
  it('separates users and falls back to anon', () => {
    expect(adventStorageKey('scs', 'sec1', 2026, 'u1')).toBe('okr.advent.scs.sec1.2026.u1');
    expect(adventStorageKey('scs', 'sec1', 2026)).toBe('okr.advent.scs.sec1.2026.anon');
  });
  it('accepts only a day 1..25', () => {
    expect(parseOpenedUpTo('7')).toBe(7);
    expect(parseOpenedUpTo(null)).toBe(0);
    expect(parseOpenedUpTo('abc')).toBe(0);
    expect(parseOpenedUpTo('26')).toBe(0);
    expect(parseOpenedUpTo('0')).toBe(0);
  });
});

describe('openDoorsOnLoad', () => {
  it('opens every unlocked door up to the stored one', () => {
    expect([...openDoorsOnLoad(3, 2026, new Date(2026, 11, 10))]).toEqual([1, 2, 3]);
  });
  it('never opens a door that is still locked', () => {
    expect([...openDoorsOnLoad(10, 2026, new Date(2026, 11, 2))]).toEqual([1, 2]);
  });
  it('opens nothing without a stored value', () => {
    expect(openDoorsOnLoad(0, 2026, new Date(2026, 11, 20)).size).toBe(0);
  });
});

describe('generateAdventLayout', () => {
  it('returns 25 doors inside the section, deterministic per seed', () => {
    const a = generateAdventLayout(42);
    expect(a).toHaveLength(ADVENT_DOOR_COUNT);
    expect(a.map(d => d.day)).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
    for (const d of a) {
      expect(d.x).toBeGreaterThanOrEqual(0);
      expect(d.y).toBeGreaterThanOrEqual(0);
      expect(d.x + d.w).toBeLessThanOrEqual(100);
      expect(d.y + d.h).toBeLessThanOrEqual(100);
    }
    expect(generateAdventLayout(42)).toEqual(a);
    expect(generateAdventLayout(43)).not.toEqual(a);
  });
  it('does not let doors overlap', () => {
    const doors = generateAdventLayout(7);
    for (const a of doors) for (const b of doors) {
      if (a === b) continue;
      const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      expect(overlap).toBe(false);
    }
  });
});

describe('createAdventDoors / rearrangeAdventDoors', () => {
  it('keeps every image when the layout changes', () => {
    const doors = createAdventDoors(1);
    doors[4] = { ...doors[4], image: img('tenant/scs/section/s/door5.jpg') };
    const moved = rearrangeAdventDoors(doors, 2);
    expect(moved.find(d => d.day === 5)?.image.url).toBe('tenant/scs/section/s/door5.jpg');
    expect(moved.find(d => d.day === 5)?.x).not.toBe(doors[4].x);
  });
  it('restores missing days', () => {
    expect(rearrangeAdventDoors([], 3)).toHaveLength(25);
  });
  it('does not share one image object between doors', () => {
    const doors = createAdventDoors(1);
    expect(doors[0].image).not.toBe(doors[1].image);
  });
});

describe('resolveAdventBackground / adventImageName', () => {
  const list = [img('a/one.jpg', 'One'), img('a/two.jpg')];
  it('picks the chosen one, else the first', () => {
    expect(resolveAdventBackground(list, 'a/two.jpg')?.url).toBe('a/two.jpg');
    expect(resolveAdventBackground(list, '')?.url).toBe('a/one.jpg');
    expect(resolveAdventBackground(list, 'gone.jpg')?.url).toBe('a/one.jpg');
    expect(resolveAdventBackground([], 'a/one.jpg')).toBeUndefined();
  });
  it('names an image by label, else by file name', () => {
    expect(adventImageName(list[0])).toBe('One');
    expect(adventImageName(list[1])).toBe('two.jpg');
  });
});

describe('coverBox', () => {
  it('scales a wide image to the container height and centres it', () => {
    expect(coverBox(400, 800, 2000, 1000)).toEqual({ width: 1600, height: 800, offsetX: -600, offsetY: 0 });
  });
  it('returns undefined for an unknown size', () => {
    expect(coverBox(400, 800, 0, 0)).toBeUndefined();
  });
});

describe('adventLinkKind', () => {
  it('classifies links', () => {
    expect(adventLinkKind('')).toBe('none');
    expect(adventLinkKind('https://example.ch')).toBe('external');
    expect(adventLinkKind('/private/page/x')).toBe('internal');
    expect(adventLinkKind('javascript:alert(1)')).toBe('none');
  });
});

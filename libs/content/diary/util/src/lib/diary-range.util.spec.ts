import { describe, expect, it } from 'vitest';

import { buildDiaryRangeTree, diaryRangeBounds, diaryRangeOfYear, isWideDiaryRange } from './diary-range.util';

describe('buildDiaryRangeTree', () => {
  it('builds newest-first centuries → decades → years, clipped to the range', () => {
    const tree = buildDiaryRangeTree(1930, 2026);
    expect(tree.map(n => n.range.label)).toEqual(['20xx', '19xx']);
    expect(tree[0].children.map(n => n.range.label)).toEqual(['202x', '201x', '200x']);
    expect(tree[0].children[0].children.map(n => n.range.label)).toEqual(['2026', '2025', '2024', '2023', '2022', '2021', '2020']);
    expect(tree[1].children.at(-1)!.range).toEqual({ level: 'decade', from: 1930, to: 1939, label: '193x' });
  });

  it('clips a century to the first and current year', () => {
    expect(buildDiaryRangeTree(1930, 2026)[0].range).toMatchObject({ from: 2000, to: 2026 });
    expect(buildDiaryRangeTree(1930, 2026)[1].range).toMatchObject({ from: 1930, to: 1999 });
  });

  it('includes an 18xx century when firstYear is in it', () => {
    expect(buildDiaryRangeTree(1895, 1905).map(n => n.range.label)).toEqual(['19xx', '18xx']);
  });
});

describe('diaryRangeBounds', () => {
  it('gives store-date bounds', () => {
    expect(diaryRangeBounds(diaryRangeOfYear(1984))).toEqual({ from: '19840000', to: '19841231' });
  });
});

describe('isWideDiaryRange', () => {
  it('treats all and centuries as wide, decades and years not', () => {
    const tree = buildDiaryRangeTree(1930, 2026);
    expect(isWideDiaryRange(undefined)).toBe(true);
    expect(isWideDiaryRange(tree[1].range)).toBe(true);
    expect(isWideDiaryRange(tree[1].children[0].range)).toBe(false);
    expect(isWideDiaryRange(diaryRangeOfYear(2026))).toBe(false);
  });
});

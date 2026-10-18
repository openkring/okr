/**
 * The diary's period selector mirrors the Drive archive's folder tree (spec 1.106 §1.2):
 * Jahrhundert (`19xx`) → Jahrzehnt (`198x`) → Jahr (`1984`). Any node can be selected; its
 * range is clipped to the years that can hold entries at all.
 */
export type DiaryRangeLevel = 'century' | 'decade' | 'year';

export interface DiaryRange {
  level: DiaryRangeLevel;
  /** first year, inclusive */
  from: number;
  /** last year, inclusive */
  to: number;
  /** '19xx' | '198x' | '1984' */
  label: string;
}

export interface DiaryRangeNode {
  range: DiaryRange;
  children: DiaryRangeNode[];
}

export function diaryRangeOfYear(year: number): DiaryRange {
  return { level: 'year', from: year, to: year, label: String(year) };
}

/**
 * Newest first at every level. A century or decade only appears when it holds at least one year
 * between `firstYear` and `currentYear`, and its `from`/`to` are clipped to that window.
 */
export function buildDiaryRangeTree(firstYear: number, currentYear: number): DiaryRangeNode[] {
  const centuries: DiaryRangeNode[] = [];
  for (let c = Math.floor(currentYear / 100); c >= Math.floor(firstYear / 100); c--) {
    const decades: DiaryRangeNode[] = [];
    for (let d = Math.min(c * 10 + 9, Math.floor(currentYear / 10)); d >= Math.max(c * 10, Math.floor(firstYear / 10)); d--) {
      const years: DiaryRangeNode[] = [];
      for (let y = Math.min(d * 10 + 9, currentYear); y >= Math.max(d * 10, firstYear); y--) {
        years.push({ range: diaryRangeOfYear(y), children: [] });
      }
      decades.push({ range: { level: 'decade', from: years[years.length - 1].range.from, to: years[0].range.to, label: `${d}x` }, children: years });
    }
    centuries.push({ range: { level: 'century', from: decades[decades.length - 1].range.from, to: decades[0].range.to, label: `${c}xx` }, children: decades });
  }
  return centuries;
}

/** `DateFormat.StoreDate` bounds; the zero-day start includes the year's aggregates. */
export function diaryRangeBounds(range: DiaryRange): { from: string; to: string } {
  return { from: `${range.from}0000`, to: `${range.to}1231` };
}

/** All years (undefined) and whole centuries load enough entries to warrant the hint. */
export function isWideDiaryRange(range: DiaryRange | undefined): boolean {
  return range === undefined || range.level === 'century';
}

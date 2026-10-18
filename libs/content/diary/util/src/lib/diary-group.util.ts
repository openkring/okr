import { DiaryModel } from '@okr/shared-models';

/**
 * One block of the month-grouped diary list (spec 1.106 §1.1). `key` is `yyyyMM` for a month
 * accordion, or `yyyy` for a year aggregate, which renders flat above its year's months.
 */
export interface DiaryGroup {
  key: string;
  isYear: boolean;
  items: DiaryModel[];
}

/**
 * Groups an already sorted list without re-sorting it: a new group starts whenever the key
 * changes. `DiaryService` sorts aggregates to the head of their period, so a month aggregate
 * lands first in its month.
 */
export function groupDiariesByMonth(diaries: DiaryModel[]): DiaryGroup[] {
  const groups: DiaryGroup[] = [];
  for (const diary of diaries) {
    const isYear = diary.scope === 'year';
    const key = isYear ? diary.date.slice(0, 4) : diary.date.slice(0, 6);
    const last = groups[groups.length - 1];
    if (last && last.key === key && last.isYear === isYear) last.items.push(diary);
    else groups.push({ key, isYear, items: [diary] });
  }
  return groups;
}

/** One year of the grouped list: its aggregate (if any) above its month accordions. */
export interface DiaryYearSegment {
  year: string;
  yearGroup?: DiaryGroup;
  months: DiaryGroup[];
}

/**
 * Cuts the month groups into years so that a year aggregate renders above ITS months and not
 * above every month of a decade (spec 1.106 §1.1). Keeps the input order.
 */
export function segmentDiaryGroupsByYear(groups: DiaryGroup[]): DiaryYearSegment[] {
  const segments: DiaryYearSegment[] = [];
  for (const group of groups) {
    const year = group.key.slice(0, 4);
    let segment = segments[segments.length - 1];
    if (!segment || segment.year !== year) {
      segment = { year, months: [] };
      segments.push(segment);
    }
    if (group.isYear) segment.yearGroup = group;
    else segment.months.push(group);
  }
  return segments;
}

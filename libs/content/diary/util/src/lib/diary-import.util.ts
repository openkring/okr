import { DiaryModel } from '@okr/shared-models';

import { isDiaryCalendarDay, splitDiaryDate } from './diary-date.util';

/**
 * A diary import may be limited to the archive files dated on or after `fromDate` (StoreDate).
 * '' means the whole archive. Anything else must be a real calendar day — an aggregate's zeroed
 * date ('20260800') is not a sensible floor and is rejected rather than guessed at.
 */
export function isValidImportFromDate(fromDate: string): boolean {
  return fromDate === '' || isDiaryCalendarDay(fromDate);
}

/**
 * True when an archive file belongs to an import that starts at `fromDate`. The date is the
 * file name's 'yyyyMMdd' prefix (archive convention: `<date>diary<Topic>.md`), compared as a
 * string, so a month or year aggregate counts from its zeroed date: '20261000' is inside a
 * run from '20260827', '20260800' is not. A name without a date prefix is never inside a
 * limited run — there is no date to put it after the floor.
 */
export function isInImportRange(fileName: string, fromDate: string): boolean {
  if (fromDate === '') return true;
  const prefix = /^(\d{8})/.exec(fileName)?.[1];
  return prefix !== undefined && prefix >= fromDate;
}

/**
 * The default floor for the next import: the day after the newest entry that came from the
 * archive. "Came from the archive" means it carries a `driveFolderId` and is a final day entry
 * dated no later than `today` — app-authored entries have no folder id, image-only placeholders
 * are drafts, and the archive holds day folders for planned trips that must not move the floor
 * into the future. Returns '' when nothing has been imported yet (= whole archive).
 */
export function suggestImportFromDate(diaries: DiaryModel[], today: string): string {
  let newest = '';
  for (const diary of diaries) {
    if (diary.isArchived || diary.scope !== 'day' || diary.status !== 'final' || !diary.driveFolderId) continue;
    if (diary.date > today || diary.date <= newest || !isDiaryCalendarDay(diary.date)) continue;
    newest = diary.date;
  }
  return newest === '' ? '' : nextCalendarDay(newest);
}

function nextCalendarDay(date: string): string {
  const parts = splitDiaryDate(date);
  if (!parts) return '';
  const next = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1));
  const pad2 = (n: number): string => String(n).padStart(2, '0');
  return `${next.getUTCFullYear()}${pad2(next.getUTCMonth() + 1)}${pad2(next.getUTCDate())}`;
}

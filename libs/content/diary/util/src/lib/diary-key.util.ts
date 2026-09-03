import { DiaryModel } from '@okr/shared-models';
import { DateFormat, getTodayStr } from '@okr/shared-util-core';

/**
 * The deterministic document id `diaries/<tenant>__<authorKey>__<date>` — the same shape the
 * import writes (`diaryDocId` in apps/functions/src/diary/import-diary.ts delegates here).
 * One id per (tenant, author, date) is what makes "one entry per day" structural: creating a
 * second entry for a day is an overwrite of the first, never a duplicate. The store guards
 * against that overwrite by reading the id first (DiaryStore.add).
 */
export function diaryKey(tenantId: string, authorKey: string, date: string): string {
  return `${tenantId}__${authorKey}__${date}`;
}

/** A fresh entry for the author, keyed for its date, tagged like every imported one. */
export function newDiary(tenantId: string, authorKey: string, date = getTodayStr(DateFormat.StoreDate)): DiaryModel {
  const diary = new DiaryModel(tenantId);
  diary.authorKey = authorKey;
  diary.date = date;
  diary.okey = diaryKey(tenantId, authorKey, date);
  diary.tags = 'diary';
  return diary;
}

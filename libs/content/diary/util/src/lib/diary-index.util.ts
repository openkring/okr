import { DiaryModel } from '@okr/shared-models';
import { addIndexElement } from '@okr/shared-util-core';

/** The search index — everything the list's search box should find an entry by. */
export function getDiaryIndex(diary: DiaryModel): string {
  let index = '';
  index = addIndexElement(index, 'd', diary.date);
  index = addIndexElement(index, 't', diary.title ?? '');
  index = addIndexElement(index, 'l', diary.location?.label || diary.location?.name1 || diary.customLocationLabel || '');
  const people = [
    ...(diary.people ?? []).map(p => p.label || `${p.name1} ${p.name2}`.trim()),
    ...(diary.customPeopleLabels ?? []),
  ].filter(Boolean).join(' ');
  index = addIndexElement(index, 'p', people);
  index = addIndexElement(index, 'e', (diary.events ?? []).join(' '));
  index = addIndexElement(index, 'pl', (diary.places ?? []).join(' '));
  return index;
}

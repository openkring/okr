import { DiaryModel } from '@okr/shared-models';
import { addIndexElement } from '@okr/shared-util-core';

import { diaryAvatarName } from './diary-avatar.util';

/** The search index — everything the list's search box should find an entry by. */
export function getDiaryIndex(diary: DiaryModel): string {
  let index = '';
  index = addIndexElement(index, 'd', diary.date);
  index = addIndexElement(index, 't', diary.title ?? '');
  index = addIndexElement(index, 'l', (diary.locations ?? []).map(diaryAvatarName).filter(Boolean).join(' '));
  index = addIndexElement(index, 'p', (diary.people ?? []).map(diaryAvatarName).filter(Boolean).join(' '));
  index = addIndexElement(index, 'e', (diary.events ?? []).join(' '));
  return index;
}

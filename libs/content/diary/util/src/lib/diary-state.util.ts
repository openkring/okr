import { DiaryModel } from '@okr/shared-models';

/**
 * The derived state of an entry — one more than `DiaryModel.status` knows.
 *
 * `status: 'draft'` is overloaded: the spec uses it for a NEW entry that is still waiting for
 * its weather, and the import used it for the 1'642 image-folder placeholders it wrote for
 * folders with photos but no text. The list needs to tell them apart (a placeholder shows no
 * text preview and can be filtered out), so the placeholder is detected, not stored.
 */
export type DiaryState = 'final' | 'draft' | 'placeholder';
export type DiaryStateFilter = 'all' | DiaryState;

/**
 * The comment the archive script writes into a placeholder's body. It is the only stable
 * signature: replacing the text removes it, which is exactly when the entry stops being one.
 */
export const DIARY_PLACEHOLDER_MARKER = '<!-- Platzhalter:';

export function isDiaryPlaceholder(diary: DiaryModel): boolean {
  return diary.status === 'draft'
    && (diary.sourceDocument ?? '') === ''
    && (diary.text ?? '').includes(DIARY_PLACEHOLDER_MARKER);
}

export function diaryStateOf(diary: DiaryModel): DiaryState {
  if (diary.status === 'final') return 'final';
  return isDiaryPlaceholder(diary) ? 'placeholder' : 'draft';
}

export function diaryStateMatches(diary: DiaryModel, filter: DiaryStateFilter): boolean {
  return filter === 'all' || diaryStateOf(diary) === filter;
}

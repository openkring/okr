import { describe, expect, it } from 'vitest';
import { DiaryModel } from '@okr/shared-models';
import { DIARY_PLACEHOLDER_MARKER, diaryStateMatches, diaryStateOf, isDiaryPlaceholder } from './diary-state.util';

function diary(patch: Partial<DiaryModel>): DiaryModel {
  return { ...new DiaryModel('t1'), ...patch };
}

describe('diaryStateOf', () => {
  it('is placeholder for an imported image folder', () => {
    const d = diary({ status: 'draft', sourceDocument: '', text: `Title\n\n${DIARY_PLACEHOLDER_MARKER} dieser Ordner enthält Bilder -->` });
    expect(isDiaryPlaceholder(d)).toBe(true);
    expect(diaryStateOf(d)).toBe('placeholder');
  });
  it('is draft once the placeholder text is replaced', () => {
    expect(diaryStateOf(diary({ status: 'draft', text: 'real text' }))).toBe('draft');
  });
  it('is draft, not placeholder, when a source document exists', () => {
    expect(diaryStateOf(diary({ status: 'draft', sourceDocument: 'x.pdf', text: `${DIARY_PLACEHOLDER_MARKER} -->` }))).toBe('draft');
  });
  it('is final for a final entry regardless of text', () => {
    expect(diaryStateOf(diary({ status: 'final', text: `${DIARY_PLACEHOLDER_MARKER} -->` }))).toBe('final');
  });
});

describe('diaryStateMatches', () => {
  it("'all' matches everything", () => expect(diaryStateMatches(diary({}), 'all')).toBe(true));
  it('matches the derived state', () => {
    expect(diaryStateMatches(diary({ status: 'final' }), 'final')).toBe(true);
    expect(diaryStateMatches(diary({ status: 'final' }), 'draft')).toBe(false);
  });
});

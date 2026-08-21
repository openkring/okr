import { describe, expect, it } from 'vitest';
import { DIARY_FILE_NAME } from './diary-file';

describe('DIARY_FILE_NAME', () => {
  it('accepts a dated diary file with a title', () => {
    expect(DIARY_FILE_NAME.test('20260820diaryToteFische.md')).toBe(true);
  });

  it('accepts a dated diary file without a title', () => {
    expect(DIARY_FILE_NAME.test('20260820diary.md')).toBe(true);
  });

  it('rejects another markdown file that lives in the same day folder', () => {
    expect(DIARY_FILE_NAME.test('20260820mmbMenuStripe.md')).toBe(false);
    expect(DIARY_FILE_NAME.test('20260330claudeObsidian_initial.md')).toBe(false);
  });

  it('rejects a diary file without the date prefix and a non-markdown file', () => {
    expect(DIARY_FILE_NAME.test('diaryToteFische.md')).toBe(false);
    expect(DIARY_FILE_NAME.test('20260820diaryToteFische.pdf')).toBe(false);
  });
});

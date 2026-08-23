// apps/functions/src/diary/read-archive.spec.ts
import { describe, expect, it } from 'vitest';
import { keepDiaryFiles } from './read-archive';

describe('keepDiaryFiles', () => {
  it('keeps a well-formed diary file name', () => {
    expect(keepDiaryFiles([{ name: '20200103diaryBeispiel.md' }])).toHaveLength(1);
  });

  it('drops what the Drive query matched but the pattern rejects', () => {
    // `name contains 'diary'` is a PREFILTER Drive can express; the pattern is the criterion.
    const kept = keepDiaryFiles([
      { name: '20200103diaryBeispiel.md' }, // keep
      { name: 'diaryNotizen.md' }, // no date prefix
      { name: '2020013diary.md' }, // 7 digits, not 8
      { name: '20200103diary.txt' }, // not markdown
      { name: '20200103diary.md.bak' }, // trailing suffix
    ]);
    expect(kept.map((e) => e.name)).toEqual(['20200103diaryBeispiel.md']);
  });

  it('returns an empty list unchanged', () => {
    expect(keepDiaryFiles([])).toEqual([]);
  });
});

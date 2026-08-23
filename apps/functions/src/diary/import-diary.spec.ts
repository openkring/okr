import { describe, expect, it } from 'vitest';
import { diaryDocId, nextWindow } from './import-diary';

describe('diaryDocId', () => {
  it('is deterministic, so every write is an upsert', () => {
    expect(diaryDocId('bka', 'owner_bka', '20200103')).toBe('bka__owner_bka__20200103');
    expect(diaryDocId('bka', 'owner_bka', '20200103')).toBe(diaryDocId('bka', 'owner_bka', '20200103'));
  });
});

describe('nextWindow', () => {
  const names = ['20200101diary.md', '20200102diary.md', '20200103diary.md'];

  it('starts at the beginning when the cursor is empty', () => {
    expect(nextWindow(names, '', 2)).toEqual(['20200101diary.md', '20200102diary.md']);
  });

  it('resumes strictly after the cursor, so no file is imported twice', () => {
    expect(nextWindow(names, '20200102diary.md', 2)).toEqual(['20200103diary.md']);
  });

  it('returns nothing once the cursor has passed the last file', () => {
    expect(nextWindow(names, '20200103diary.md', 2)).toEqual([]);
  });

  it('tolerates a cursor naming a file that is no longer there', () => {
    // A file deleted between two invocations must not strand the run.
    expect(nextWindow(names, '20200102geloescht.md', 2)).toEqual(['20200103diary.md']);
  });
});

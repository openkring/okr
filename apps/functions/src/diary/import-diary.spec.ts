import { describe, expect, it } from 'vitest';
import { compareFileName, diaryDocId, nextWindow } from './import-diary';

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

  it('assumes names are sorted in compareFileName (code-unit) order, not locale order — pins the ordering contract that keeps every file visited exactly once', () => {
    // Two files sharing a date prefix, differing only in case. Code-unit order ('Z' = U+005A <
    // 'a' = U+0061) and locale order ('a' before 'Z', case-insensitive-first) rank them oppositely.
    const mixedCase = ['20200101diaryZoo.md', '20200101diaryabend.md'];

    const codeUnitSorted = [...mixedCase].sort(compareFileName);
    expect(codeUnitSorted).toEqual(['20200101diaryZoo.md', '20200101diaryabend.md']);

    // Walking the CORRECTLY (code-unit) sorted list visits both files exactly once.
    const first = nextWindow(codeUnitSorted, '', 1);
    expect(first).toEqual(['20200101diaryZoo.md']);
    expect(nextWindow(codeUnitSorted, first[0], 1)).toEqual(['20200101diaryabend.md']);

    // A locale sort (what an earlier version of listSortedArchive used) orders the same two names
    // the OTHER way round. Walking that list with the very same nextWindow then silently drops
    // '...Zoo.md': it never sorts after '...abend.md' in code-unit terms, so it can never resurface
    // as a "next" file once the cursor has passed '...abend.md'. This is Finding 1, pinned down so
    // listSortedArchive's sort and nextWindow's cursor comparison cannot drift apart again.
    const localeSorted = [...mixedCase].sort((a, b) => a.localeCompare(b));
    expect(localeSorted).toEqual(['20200101diaryabend.md', '20200101diaryZoo.md']);
    const badFirst = nextWindow(localeSorted, '', 1);
    expect(badFirst).toEqual(['20200101diaryabend.md']);
    expect(nextWindow(localeSorted, badFirst[0], 1)).toEqual([]); // '...Zoo.md' silently skipped
  });
});

describe('compareFileName', () => {
  it('orders by plain UTF-16 code unit, not locale — the same order nextWindow assumes', () => {
    expect(compareFileName('20200101diaryZoo.md', '20200101diaryabend.md')).toBeLessThan(0);
    expect(compareFileName('20200101diaryabend.md', '20200101diaryZoo.md')).toBeGreaterThan(0);
    expect(compareFileName('same.md', 'same.md')).toBe(0);
  });
});

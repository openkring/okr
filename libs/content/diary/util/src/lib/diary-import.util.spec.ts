import { describe, expect, it } from 'vitest';
import { DiaryModel } from '@okr/shared-models';

import { isInImportRange, isValidImportFromDate, suggestImportFromDate } from './diary-import.util';

function diary(date: string, patch: Partial<DiaryModel> = {}): DiaryModel {
  return { ...new DiaryModel('bka'), date, status: 'final', driveFolderId: 'folder', ...patch };
}

describe('isValidImportFromDate', () => {
  it('accepts empty (whole archive) and real days', () => {
    expect(isValidImportFromDate('')).toBe(true);
    expect(isValidImportFromDate('20260827')).toBe(true);
  });
  it('rejects aggregates, impossible days and other formats', () => {
    expect(isValidImportFromDate('20260800')).toBe(false);
    expect(isValidImportFromDate('20260231')).toBe(false);
    expect(isValidImportFromDate('2026-08-27')).toBe(false);
  });
});

describe('isInImportRange', () => {
  it('takes everything without a floor', () => {
    expect(isInImportRange('19400000diaryAlbum.md', '')).toBe(true);
  });
  it('includes the floor day and later files', () => {
    expect(isInImportRange('20260827diaryBeerdigung.md', '20260827')).toBe(true);
    expect(isInImportRange('20261012diaryImpfung.md', '20260827')).toBe(true);
  });
  it('excludes earlier files', () => {
    expect(isInImportRange('20260826diaryLuzern.md', '20260827')).toBe(false);
  });
  it('places aggregates by their zeroed date', () => {
    expect(isInImportRange('20261000diaryVitra.md', '20260827')).toBe(true);
    expect(isInImportRange('20260800diaryAugust.md', '20260827')).toBe(false);
  });
  it('excludes a name without a date prefix from a limited run', () => {
    expect(isInImportRange('diaryOhneDatum.md', '20260827')).toBe(false);
  });
});

describe('suggestImportFromDate', () => {
  const today = '20261012';

  it('is the day after the newest imported final day', () => {
    expect(suggestImportFromDate([diary('20260820'), diary('20260826')], today)).toBe('20260827');
  });
  it('rolls over month and year ends', () => {
    expect(suggestImportFromDate([diary('20260831')], today)).toBe('20260901');
    expect(suggestImportFromDate([diary('20251231')], today)).toBe('20260101');
  });
  it('ignores app-authored, draft, archived, aggregate and future entries', () => {
    const diaries = [
      diary('20260826'),
      diary('20260906', { driveFolderId: '' }),
      diary('20260901', { status: 'draft' }),
      diary('20260903', { isArchived: true }),
      diary('20260900', { scope: 'month' }),
      diary('20270102'),
    ];
    expect(suggestImportFromDate(diaries, today)).toBe('20260827');
  });
  it('is empty when nothing was imported yet', () => {
    expect(suggestImportFromDate([], today)).toBe('');
    expect(suggestImportFromDate([diary('20260906', { driveFolderId: '' })], today)).toBe('');
  });
});

import { describe, expect, it } from 'vitest';

import { TRANSPORT_MODES } from '@okr/shared-models';

import {
  BOOK_LABEL_KEYS, BookExportRequestError, bookObjectPath, bookAuthorName, bookPhotoSources, canStartExport, exportLinkPaths, exportWarningCount, parseBookExportRequest,
  parseBookRequest,
} from './book.logic';

const NOW = Date.parse('2026-10-25T10:00:00Z');
const labels = (): Record<string, unknown> => ({
  ...Object.fromEntries(BOOK_LABEL_KEYS.map((k) => [k, k])),
  transport: Object.fromEntries(TRANSPORT_MODES.map((m) => [m, m])),
});

describe('book export logic', () => {
  it('a running export blocks a second one', () => {
    const running = { kind: 'print' as const, state: 'running' as const, startedAt: '2026-10-25T09:30:00Z' };
    expect(canStartExport(running, NOW)).toBe(false);
    // still blocked at 60 min (the function's own timeout), free after 65 min: that instance has died
    expect(canStartExport({ ...running, startedAt: '2026-10-25T09:00:00Z' }, NOW)).toBe(false);
    expect(canStartExport({ ...running, startedAt: '2026-10-25T08:55:00Z' }, NOW)).toBe(true);
    expect(canStartExport({ ...running, startedAt: 'garbage' }, NOW)).toBe(true);
    expect(canStartExport({ ...running, state: 'done' }, NOW)).toBe(true);
    expect(canStartExport({ ...running, state: 'failed' }, NOW)).toBe(true);
    expect(canStartExport(undefined, NOW)).toBe(true);
  });

  it('the request needs op export, a journal key, a kind and every label as a short string', () => {
    const req = parseBookExportRequest({ op: 'export', journalKey: 'j1', kind: 'print', labels: { ...labels(), extra: 'x' } });
    expect(req.kind).toBe('print');
    expect(req.labels.day).toBe('day');
    expect(req.labels.transport.plane).toBe('plane');
    expect('extra' in req.labels).toBe(false); // unknown keys are dropped
    expect(() => parseBookExportRequest({ op: 'delete', journalKey: 'j1', kind: 'print', labels: labels() })).toThrow(BookExportRequestError);
    expect(() => parseBookExportRequest({ op: 'export', journalKey: 'j1', kind: 'pdf', labels: labels() })).toThrow(BookExportRequestError);
    expect(() => parseBookExportRequest({ op: 'export', journalKey: 'j1', kind: 'screen' })).toThrow(BookExportRequestError);
    expect(() => parseBookExportRequest({ op: 'export', journalKey: 'j1', kind: 'screen', labels: { ...labels(), day: 3 } })).toThrow(BookExportRequestError);
    expect(() => parseBookExportRequest({ op: 'export', journalKey: 'j1', kind: 'screen', labels: { ...labels(), day: 'x'.repeat(201) } })).toThrow(BookExportRequestError);
    const { credit: _credit, ...noCredit } = labels();
    expect(() => parseBookExportRequest({ op: 'export', journalKey: 'j1', kind: 'screen', labels: noCredit })).toThrow(BookExportRequestError);
    const badTransport = { ...labels(), transport: { ...(labels()['transport'] as object), plane: 7 } };
    expect(() => parseBookExportRequest({ op: 'export', journalKey: 'j1', kind: 'screen', labels: badTransport })).toThrow(BookExportRequestError);
    expect(parseBookExportRequest({ op: 'export', journalKey: 'j1', kind: 'screen', labels: { ...labels(), colophon: '' } }).labels.colophon).toBe('');
  });

  it('book files live under the journal folder of the private bucket', () => {
    expect(bookObjectPath('scs', 'j1', 'print', NOW)).toBe('tenant/scs/journal/j1/book/print-20261025T100000Z.pdf');
    expect(bookObjectPath('scs', 'j1', 'cover', NOW)).toBe('tenant/scs/journal/j1/book/cover-20261025T100000Z.pdf');
  });
});

describe('the links op (ruling R10)', () => {
  const jk = 'a'.repeat(20);

  it('parses { op: links, journalKey } and still hands an export request to the export parser', () => {
    expect(parseBookRequest({ op: 'links', journalKey: jk })).toEqual({ op: 'links', journalKey: jk });
    expect(() => parseBookRequest({ op: 'links', journalKey: '../x' })).toThrow(BookExportRequestError);
    expect(() => parseBookRequest({ op: 'delete', journalKey: jk })).toThrow(BookExportRequestError);
    expect(() => parseBookRequest({ op: 'export', journalKey: jk, kind: 'print' })).toThrow(BookExportRequestError); // labels missing
  });

  it('signs only a finished export, and only PDFs inside the journal book folder', () => {
    const bookPath = bookObjectPath('bkg', jk, 'print', 0);
    const coverPath = bookObjectPath('bkg', jk, 'cover', 0);
    const done = { kind: 'print' as const, state: 'done' as const, startedAt: '', bookPath, coverPath };
    expect(exportLinkPaths(done, 'bkg', jk)).toEqual({ bookPath, coverPath });
    expect(exportLinkPaths({ ...done, coverPath: undefined }, 'bkg', jk)).toEqual({ bookPath });
    expect(exportLinkPaths({ ...done, state: 'running' }, 'bkg', jk)).toBeUndefined();
    expect(exportLinkPaths({ ...done, bookPath: 'tenant/other/journal/x/book/print.pdf' }, 'bkg', jk)).toBeUndefined();
    expect(exportLinkPaths({ ...done, coverPath: 'tenant/bkg/secret.pdf' }, 'bkg', jk)).toEqual({ bookPath });
    expect(exportLinkPaths(undefined, 'bkg', jk)).toBeUndefined();
  });
});

describe('photo sources (book final review)', () => {
  // the 2048 px file is named after its own UUID (Swift `UUID()-2048.jpg`), not after the image entity key
  const imageKey = '7f1c0d2e-1111-4a4a-8b8b-000000000001';
  const image = { path2048: 'journals/j1/0a9b8c7d-2222-4c4c-9d9d-000000000002-2048.jpg' };

  it('print: the print photo by image key first, then the 2048 px photo by its own file name', () => {
    expect(bookPhotoSources(imageKey, image, true)).toEqual([`${imageKey}-print.jpg`, '0a9b8c7d-2222-4c4c-9d9d-000000000002-2048.jpg']);
  });

  it('screen: only the 2048 px photo, never a name built from the image key', () => {
    expect(bookPhotoSources(imageKey, image, false)).toEqual(['0a9b8c7d-2222-4c4c-9d9d-000000000002-2048.jpg']);
    expect(bookPhotoSources(imageKey, image, false)).not.toContain(`${imageKey}-2048.jpg`);
  });

  it('an image the state does not know, or a path that is not a plain photo file, adds nothing', () => {
    expect(bookPhotoSources(imageKey, undefined, false)).toEqual([]);
    expect(bookPhotoSources(imageKey, undefined, true)).toEqual([`${imageKey}-print.jpg`]);
    expect(bookPhotoSources(imageKey, { path2048: '' }, false)).toEqual([]);
    expect(bookPhotoSources(imageKey, { path2048: 'journals/j1/../x.png' }, false)).toEqual([]);
    expect(bookPhotoSources('../evil', { path2048: '' }, true)).toEqual([]);
  });
});

describe('author names (ruling R13)', () => {
  const base = { op: 'export', journalKey: 'j1', kind: 'print', labels: labels() };

  it('are strings of at most 200 characters, an empty name allowed, absent = none', () => {
    expect(parseBookExportRequest({ ...base, authorNames: { bruno: 'Bruno Kaiser', anna: '' } }).authorNames).toEqual({ bruno: 'Bruno Kaiser', anna: '' });
    expect(parseBookExportRequest(base).authorNames).toEqual({});
    expect(() => parseBookExportRequest({ ...base, authorNames: { bruno: 7 } })).toThrow(BookExportRequestError);
    expect(() => parseBookExportRequest({ ...base, authorNames: { bruno: 'x'.repeat(201) } })).toThrow(BookExportRequestError);
    expect(() => parseBookExportRequest({ ...base, authorNames: ['Bruno'] })).toThrow(BookExportRequestError);
    expect(() => parseBookExportRequest({ ...base, authorNames: 'Bruno' })).toThrow(BookExportRequestError);
  });

  it('extra keys are accepted and bounded (ruling R13b)', () => {
    const names = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`p${i}`, `Name ${i}`]));
    expect(Object.keys(parseBookExportRequest({ ...base, authorNames: names(100) }).authorNames)).toHaveLength(100);
    expect(() => parseBookExportRequest({ ...base, authorNames: names(101) })).toThrow(BookExportRequestError);
    expect(() => parseBookExportRequest({ ...base, authorNames: { bruno: 'x'.repeat(201) } })).toThrow(BookExportRequestError);
    expect(() => parseBookExportRequest({ ...base, authorNames: { '../x': 'X' } })).toThrow(BookExportRequestError);
    // a co-author not yet in the synced authorKeys: accepted, and printed
    const req = parseBookExportRequest({ ...base, authorNames: { 'new-coauthor': 'Carla Neu' } });
    expect(bookAuthorName(req.authorNames, 'new-coauthor')).toBe('Carla Neu');
    expect(bookAuthorName(req.authorNames, 'someone-else')).toBe('');
    // inherited members are never names
    expect(bookAuthorName(req.authorNames, 'constructor')).toBe('');
    expect(bookAuthorName(req.authorNames, 'toString')).toBe('');
    expect(Object.getPrototypeOf(req.authorNames)).toBeNull();
  });
});

describe('export warning count', () => {
  const warnings = [
    { pageIndex: 3, imageKey: 'a', level: 'missing' as const, dpi: 170 },
    { pageIndex: 4, imageKey: 'b', level: 'poor' as const, dpi: 250 },
    { pageIndex: -1, imageKey: 'c', level: 'veryPoor' as const, dpi: 150 },
  ];
  it('print counts every warning, screen neither «Original fehlt» nor the cover; unreadable files add up', () => {
    expect(exportWarningCount(warnings, 'print', 2)).toBe(5);
    expect(exportWarningCount(warnings, 'screen', 0)).toBe(1);
    expect(exportWarningCount(warnings, 'screen', 1)).toBe(2);
  });
});

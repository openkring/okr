import { describe, expect, it } from 'vitest';

import { TRANSPORT_MODES } from '@okr/shared-models';

import { BOOK_LABEL_KEYS, BookExportRequestError, bookObjectPath, canStartExport, exportLinkPaths, parseBookExportRequest, parseBookRequest } from './book.logic';

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

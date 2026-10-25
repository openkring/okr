import { JournalBookExport, TRANSPORT_MODES, TransportMode } from '@okr/shared-models';
import { photoFileName } from '@okr/travel-journal-util';
import type { BookLabels, BookWarning } from '@okr/travel-journal-util';

import { isJournalFileName, isJournalKey, journalObjectPath } from './apply-journal-change.logic';

/** An export still «running» after this long has died with its instance (timeout 3600 s + margin): a new one may start. */
export const EXPORT_STALE_MS = 65 * 60 * 1000;
export const MAX_LABEL_LENGTH = 200;
/** At most this many author names per export request (ruling R13b). */
export const MAX_AUTHOR_NAMES = 100;

/** False while another export of the book is running (started less than 65 minutes ago). */
export function canStartExport(exp: JournalBookExport | undefined, nowMs: number): boolean {
  if (exp?.state !== 'running') return true;
  const started = Date.parse(exp.startedAt);
  return !Number.isFinite(started) || nowMs - started >= EXPORT_STALE_MS;
}

/** Every flat key of BookLabels (`transport` is checked per TransportMode). */
export const BOOK_LABEL_KEYS = [
  'day', 'stretch', 'cumulative', 'km', 'photo', 'photos', 'weather', 'transportVia', 'noTransport', 'north', 'south', 'east', 'west',
  'comments', 'statsTitle', 'days', 'footprints', 'totalKm', 'southernmost', 'northernmost', 'page', 'credit', 'colophon',
] as const satisfies readonly Exclude<keyof BookLabels, 'transport'>[];

export type BookExportKind = 'print' | 'screen';
/** `authorNames`: the printed name per author (person key → name, ruling R13), as the page's preview shows them. */
export interface BookExportRequest { op: 'export'; journalKey: string; kind: BookExportKind; labels: BookLabels; authorNames: Record<string, string> }

export class BookExportRequestError extends Error {}

const label = (value: unknown, name: string): string => {
  if (typeof value !== 'string' || value.length > MAX_LABEL_LENGTH) {
    throw new BookExportRequestError(`labels.${name}: a string of at most ${MAX_LABEL_LENGTH} characters.`);
  }
  return value;
};

/**
 * The callable's input (ruling R3): `{ op: 'export', journalKey, kind: 'print' | 'screen', labels, authorNames }`. The
 * labels are the printed words, resolved in the author's UI language by the browser; each must be a string of at most
 * 200 characters (empty allowed), unknown keys are dropped. `authorNames` (rulings R13, R13b) maps person keys to names:
 * any person keys (a co-author added on the device may not be in the synced authorKeys yet), at most
 * MAX_AUTHOR_NAMES, each key a plain id, each name a string of at most 200 characters. A request without
 * `authorNames` prints no author names.
 */
export function parseBookExportRequest(data: unknown): BookExportRequest {
  const d = (data ?? {}) as Record<string, unknown>;
  if (d['op'] !== 'export') throw new BookExportRequestError('op: export.');
  if (!isJournalKey(d['journalKey'])) throw new BookExportRequestError('Invalid journalKey.');
  const kind = d['kind'];
  if (kind !== 'print' && kind !== 'screen') throw new BookExportRequestError('kind: print or screen.');
  const raw = d['labels'];
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new BookExportRequestError('labels: an object.');
  const l = raw as Record<string, unknown>;
  const t = l['transport'];
  if (typeof t !== 'object' || t === null || Array.isArray(t)) throw new BookExportRequestError('labels.transport: an object.');
  const transport = Object.fromEntries(TRANSPORT_MODES.map((m) => [m, label((t as Record<string, unknown>)[m], `transport.${m}`)])) as Record<TransportMode, string>;
  const flat = Object.fromEntries(BOOK_LABEL_KEYS.map((k) => [k, label(l[k], k)])) as Record<(typeof BOOK_LABEL_KEYS)[number], string>;
  return { op: 'export', journalKey: d['journalKey'] as string, kind, labels: { ...flat, transport }, authorNames: authorNamesOf(d['authorNames']) };
}

function authorNamesOf(raw: unknown): Record<string, string> {
  // null prototype: a key such as `constructor` or `__proto__` is just data, never an inherited member
  const out = Object.create(null) as Record<string, string>;
  if (raw === undefined) return out;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new BookExportRequestError('authorNames: an object.');
  const entries = Object.entries(raw);
  if (entries.length > MAX_AUTHOR_NAMES) throw new BookExportRequestError(`authorNames: at most ${MAX_AUTHOR_NAMES} names.`);
  for (const [key, value] of entries) {
    if (!isJournalKey(key)) throw new BookExportRequestError('authorNames: keys must be person keys.');
    if (typeof value !== 'string' || value.length > MAX_LABEL_LENGTH) {
      throw new BookExportRequestError(`authorNames: strings of at most ${MAX_LABEL_LENGTH} characters.`);
    }
    out[key] = value;
  }
  return out;
}

/**
 * The printed name of a person (ruling R13b): an own key of `authorNames` only, else '' (no name line). Same check as
 * Object.hasOwn, which the functions' TypeScript lib (es2020) does not declare.
 */
export function bookAuthorName(authorNames: Record<string, string>, personKey: string): string {
  return Object.prototype.hasOwnProperty.call(authorNames, personKey) ? authorNames[personKey] : '';
}

/**
 * The bucket objects a photo frame is read from, in order of preference. Print: the print photo, which the iPad names
 * after the image key (`<imageKey>-print.jpg`, journal.store uploadBookPrints), then the 2048 px photo. Screen: the
 * 2048 px photo only. The 2048 px file is named after its own UUID, not the image key: its name is the last segment of
 * the image's `path2048` (`journals/<jk>/<uuid>-2048.jpg`). Names that are not plain photo file names are left out.
 */
export function bookPhotoSources(imageKey: string, image: { path2048: string } | undefined, print: boolean): string[] {
  const names = [...(print ? [`${imageKey}-print.jpg`] : []), image ? photoFileName(image.path2048) : ''];
  return names.filter((n) => isJournalFileName(n));
}

/**
 * The warning count of an export: the layout's warnings plus the photos and maps that could not be read. The screen
 * PDF has no print photos and no cover, so «Original fehlt» (missing) and the cover's warnings (pageIndex -1) do not
 * count there.
 */
export function exportWarningCount(warnings: readonly BookWarning[], kind: BookExportKind, unreadable: number): number {
  const counted = kind === 'print' ? warnings : warnings.filter((w) => w.level !== 'missing' && w.pageIndex >= 0);
  return counted.length + unreadable;
}

/** `{ op: 'links', journalKey }` (ruling R10): fresh download links of the last finished export. */
export interface BookLinksRequest { op: 'links'; journalKey: string }

/** The callable's two ops: `export` (parseBookExportRequest) and `links`. */
export function parseBookRequest(data: unknown): BookExportRequest | BookLinksRequest {
  const d = (data ?? {}) as Record<string, unknown>;
  if (d['op'] === 'links') {
    if (!isJournalKey(d['journalKey'])) throw new BookExportRequestError('Invalid journalKey.');
    return { op: 'links', journalKey: d['journalKey'] };
  }
  return parseBookExportRequest(data);
}

/**
 * The PDFs of the last export that may be signed again: only a finished export, only paths inside this journal's
 * `book/` folder (they are written by the function alone, checked anyway).
 */
export function exportLinkPaths(exp: JournalBookExport | undefined, tenantId: string, journalKey: string): { bookPath: string; coverPath?: string } | undefined {
  if (exp?.state !== 'done' || !exp.bookPath) return undefined;
  const folder = journalObjectPath(tenantId, journalKey, 'book/');
  const inside = (p: string | undefined): p is string => typeof p === 'string' && p.startsWith(folder) && !p.includes('..') && p.endsWith('.pdf');
  if (!inside(exp.bookPath)) return undefined;
  return { bookPath: exp.bookPath, ...(inside(exp.coverPath) ? { coverPath: exp.coverPath } : {}) };
}

/** `20261025T100000Z` — sortable and safe in an object name. */
export function stamp(ms: number): string {
  return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
}

/** `tenant/<tid>/journal/<jk>/book/<kind>-<ts>.pdf` in the private bucket (design §7). */
export function bookObjectPath(tenantId: string, journalKey: string, kind: BookExportKind | 'cover', ms: number): string {
  return journalObjectPath(tenantId, journalKey, `book/${kind}-${stamp(ms)}.pdf`);
}

import { JournalBookExport, TRANSPORT_MODES, TransportMode } from '@okr/shared-models';
import type { BookLabels } from '@okr/travel-journal-util';

import { isJournalKey, journalObjectPath } from './apply-journal-change.logic';

/** An export still «running» after this long has died with its instance (timeout 3600 s + margin): a new one may start. */
export const EXPORT_STALE_MS = 65 * 60 * 1000;
export const MAX_LABEL_LENGTH = 200;

/** False while another export of the book is running (started less than 65 minutes ago). */
export function canStartExport(exp: JournalBookExport | undefined, nowMs: number): boolean {
  if (exp?.state !== 'running') return true;
  const started = Date.parse(exp.startedAt);
  return !Number.isFinite(started) || nowMs - started >= EXPORT_STALE_MS;
}

/** Every flat key of BookLabels (`transport` is checked per TransportMode). */
export const BOOK_LABEL_KEYS = [
  'day', 'stretch', 'cumulative', 'km', 'photos', 'weather', 'transportVia', 'noTransport', 'north', 'south', 'east', 'west',
  'comments', 'statsTitle', 'days', 'footprints', 'totalKm', 'southernmost', 'northernmost', 'page', 'credit', 'colophon',
] as const satisfies readonly Exclude<keyof BookLabels, 'transport'>[];

export type BookExportKind = 'print' | 'screen';
export interface BookExportRequest { op: 'export'; journalKey: string; kind: BookExportKind; labels: BookLabels }

export class BookExportRequestError extends Error {}

const label = (value: unknown, name: string): string => {
  if (typeof value !== 'string' || value.length > MAX_LABEL_LENGTH) {
    throw new BookExportRequestError(`labels.${name}: a string of at most ${MAX_LABEL_LENGTH} characters.`);
  }
  return value;
};

/**
 * The callable's input (ruling R3): `{ op: 'export', journalKey, kind: 'print' | 'screen', labels }`. The labels are
 * the printed words, resolved in the author's UI language by the browser; each must be a string of at most 200
 * characters (empty allowed), unknown keys are dropped.
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
  return { op: 'export', journalKey: d['journalKey'] as string, kind, labels: { ...flat, transport } };
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

import { JournalBookExport, TRANSPORT_MODES, TransportMode } from '@okr/shared-models';
import type { BookLabels } from '@okr/travel-journal-util';

import { isJournalKey, journalObjectPath } from './apply-journal-change.logic';

/** An export still «running» after this long has died with its instance (timeout 3600 s): a new one may start. */
export const EXPORT_STALE_MS = 60 * 60 * 1000;
export const MAX_LABEL_LENGTH = 200;

/** False while another export of the book is running (started less than an hour ago). */
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

/** `20261025T100000Z` — sortable and safe in an object name. */
export function stamp(ms: number): string {
  return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
}

/** `tenant/<tid>/journal/<jk>/book/<kind>-<ts>.pdf` in the private bucket (design §7). */
export function bookObjectPath(tenantId: string, journalKey: string, kind: BookExportKind | 'cover', ms: number): string {
  return journalObjectPath(tenantId, journalKey, `book/${kind}-${stamp(ms)}.pdf`);
}

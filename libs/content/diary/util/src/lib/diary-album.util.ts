import { AvatarInfo, DiaryAlbumKind, DiaryAlbumModel, DiaryModel } from '@okr/shared-models';

import { splitDiaryDate } from './diary-date.util';
import { parseJassDiaryLine } from './diary-jass.util';

export type DiaryFilterKind = DiaryAlbumKind | 'tag' | 'trip' | 'date';

export interface DiaryFilter {
  kind: DiaryFilterKind;
  /** album key (person/location/event/tag), trip okey (trip), '' (date only) */
  key: string;
  title: string;
  /** StoreDate bounds, '' = open */
  from: string;
  to: string;
}

export function albumKey(kind: DiaryAlbumKind | 'tag', ref: string): string {
  return `${kind}.${ref}`;
}

/** Sorted, de-duplicated album keys of an entry. Tolerates legacy docs missing any field. */
export function diaryAlbumKeys(diary: Partial<Pick<DiaryModel, 'people' | 'location' | 'events' | 'tags'>>): string[] {
  const keys = new Set<string>();
  for (const person of diary.people ?? []) {
    if (person.key) keys.add(albumKey('person', person.key));
  }
  if (diary.location?.key) keys.add(albumKey('location', diary.location.key));
  for (const event of diary.events ?? []) {
    // Jass result lines live in events[] on purpose (spec 1.77) but are not event slugs.
    if (event && !parseJassDiaryLine(event)) keys.add(albumKey('event', event));
  }
  for (const tag of (diary.tags ?? '').split(',')) {
    const trimmed = tag.trim();
    if (trimmed) keys.add(albumKey('tag', trimmed));
  }
  return [...keys].sort();
}

export function diaryAlbumId(tenantId: string, authorKey: string, kind: DiaryAlbumKind, ref: string): string {
  return `${tenantId}__${authorKey}__${kind}__${ref}`;
}

/** The ref an album is keyed by: the person/location key, or the event slug. */
export function albumRefOf(album: DiaryAlbumModel): string {
  return album.kind === 'event' ? album.slug : (album.ref?.key ?? '');
}

const UMLAUTS: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' };

/** camelCase slug like the archive's: 'Zürich Fäscht 2024!' -> 'zuerichFaescht2024'. */
export function eventSlug(title: string): string {
  const ascii = title.toLowerCase().replace(/[äöüß]/g, c => UMLAUTS[c]);
  return ascii
    .split(/[^a-z0-9]+/)
    .filter(word => word !== '')
    .map((word, i) => (i === 0 ? word : word[0].toUpperCase() + word.slice(1)))
    .join('');
}

/**
 * Empty bound = open. StoreDate strings compare lexicographically, but a month or year aggregate
 * (zeroed: '20041000', '19900000') would sort just BEFORE its own first day, so a range starting on
 * 1 October 2004 would drop October's aggregate. It is compared by the first day of its period
 * instead ('20041001', '19900101'): inside whenever the range covers the start of that month/year.
 */
export function inDiaryDateRange(date: string, from: string, to: string): boolean {
  const start = diaryPeriodStart(date);
  return (from === '' || start >= from) && (to === '' || start <= to);
}

/** '20041000' -> '20041001', '19900000' -> '19900101'; a day (or anything unparsable) unchanged. */
function diaryPeriodStart(date: string): string {
  const parts = splitDiaryDate(date);
  if (!parts || (parts.month !== 0 && parts.day !== 0)) return date;
  const pad2 = (n: number): string => String(n).padStart(2, '0');
  return `${String(parts.year).padStart(4, '0')}${pad2(parts.month || 1)}${pad2(parts.day || 1)}`;
}

/** The listId for a filter: album key, `trip.<okey>`, or 'all' for a pure date filter. */
export function encodeDiaryFilter(filter: DiaryFilter): string {
  if (filter.kind === 'date') return 'all';
  return filter.kind === 'trip' ? `trip.${filter.key}` : filter.key;
}

/**
 * The diary list route for a listId. The listId is ONE path segment, but a tag listId carries the
 * user's free text (`tag.Segeln/Regatta`), so it is URI-encoded; the router hands the param back
 * decoded, so `decodeDiaryFilter` reads the plain listId again.
 */
export function diaryListUrl(listId: string, contextMenuName: string): string {
  return `/diary/${encodeURIComponent(listId)}/${contextMenuName}`;
}

export function decodeDiaryFilter(listId: string): Pick<DiaryFilter, 'kind' | 'key'> | undefined {
  const dot = listId.indexOf('.');
  if (dot < 0) return undefined;
  const kind = listId.slice(0, dot);
  const rest = listId.slice(dot + 1);
  if (kind === 'trip') return { kind: 'trip', key: rest };
  if (kind === 'person' || kind === 'location' || kind === 'event' || kind === 'tag') return { kind, key: listId };
  return undefined;
}

/** Display name of a picked avatar, used to prefill an empty album title. */
export function avatarTitle(avatar: AvatarInfo): string {
  const name = [avatar.name1, avatar.name2].filter(part => !!part).join(' ');
  return name || avatar.label || '';
}

/**
 * The chip text of an active filter: «Anna Muster · 01.01.2015–31.12.2019». A date filter shows
 * only its range; an open bound reads «ab …» / «bis …». `words` are the translated prefixes.
 */
export function diaryFilterLabel(filter: DiaryFilter, formatDate: (d: string) => string, words: { from: string; to: string }): string {
  const { from, to } = filter;
  let range = '';
  if (from && to) range = `${formatDate(from)}–${formatDate(to)}`;
  else if (from) range = `${words.from} ${formatDate(from)}`;
  else if (to) range = `${words.to} ${formatDate(to)}`;
  const title = filter.kind === 'date' ? '' : filter.title;
  return [title, range].filter(part => !!part).join(' · ');
}

/**
 * The Datum segment's result: a range applied while an album, tag or trip filter is active
 * narrows that filter («Anna, 2015–2019»); an empty range drops the narrowing and keeps the
 * album. Without one (or over a date filter) it is a pure date filter.
 */
export function mergeDiaryDateRange(current: DiaryFilter | undefined, from: string, to: string): DiaryFilter {
  if (current && current.kind !== 'date') return { ...current, from, to };
  return { kind: 'date', key: '', title: '', from, to };
}

/**
 * Whether the Datum segment may apply its range. A plain date filter needs BOTH bounds: one open
 * end would stream nearly the whole diary. While an album, tag or trip is active the query is
 * already narrow, so an open end — or an empty range, which drops the narrowing — is fine.
 */
export function canApplyDiaryDateRange(from: string, to: string, narrowsAlbum: boolean): boolean {
  return narrowsAlbum || (!!from && !!to);
}

/** A pin on the trip map (spec 1.114 §6). Structurally a shared/ui `MapMarker`; `diaryKey` '' for a trip-own location. */
export interface TripMapPoint {
  lat: number;
  lng: number;
  title: string;
  /** StoreDate of the entry; '' for a trip-own location */
  date: string;
  diaryKey: string;
  /** false for a trip-own location: pinned, but not part of the route line */
  inRoute?: boolean;
}

/**
 * The trip map's pins: the located diary entries in date order (the polyline follows them),
 * then the trip's own locations (`inRoute: false`, off the line). Entries without finite coordinates are dropped.
 */
export function tripMapPoints(
  entries: { date: string; okey: string; title: string; lat?: number; lng?: number }[],
  own: { lat: number; lng: number; title: string }[],
): TripMapPoint[] {
  const dated = entries
    .filter(e => Number.isFinite(e.lat) && Number.isFinite(e.lng))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(e => ({ lat: e.lat as number, lng: e.lng as number, title: e.title, date: e.date, diaryKey: e.okey }));
  const located = own
    .filter(o => Number.isFinite(o.lat) && Number.isFinite(o.lng))
    .map(o => ({ lat: o.lat, lng: o.lng, title: o.title, date: '', diaryKey: '', inRoute: false }));
  return [...dated, ...located];
}

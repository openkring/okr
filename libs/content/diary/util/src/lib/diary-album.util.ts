import { DiaryAlbumKind, DiaryAlbumModel, DiaryModel } from '@okr/shared-models';

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
    if (event) keys.add(albumKey('event', event));
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

/** Empty bound = open. StoreDate strings compare lexicographically; aggregates (zeroed) sort inside. */
export function inDiaryDateRange(date: string, from: string, to: string): boolean {
  return (from === '' || date >= from) && (to === '' || date <= to);
}

/** The listId for a filter: album key, `trip.<okey>`, or 'all' for a pure date filter. */
export function encodeDiaryFilter(filter: DiaryFilter): string {
  if (filter.kind === 'date') return 'all';
  return filter.kind === 'trip' ? `trip.${filter.key}` : filter.key;
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

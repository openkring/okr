import { DiaryModel } from '@okr/shared-models';

import { normaliseLocationLabel } from './location-normalise';

/** Which of the two reference kinds a diary carries: its place, or the people in it. */
export type DiaryReferenceKind = 'location' | 'person';

/** The resolved/unresolved split, as the list's filter offers it. */
export type DiaryReferenceFilter = 'all' | 'resolved' | 'unresolved';

/** One diary a reference appears in — just enough to name it in a list and write back to it. */
export interface DiaryUsage {
  okey: string;
  /** DateFormat.StoreDate ('yyyyMMdd'); zeroed components are legal — see DiaryScope. */
  date: string;
  title: string;
}

/**
 * One place or person the archive mentions, aggregated over every diary that mentions it.
 *
 * The import writes BOTH halves of each pair: a match against `locations`/`persons` lands in
 * `DiaryModel.location`/`.people` as an `AvatarInfo`, everything else stays as the raw text in
 * `.customLocationLabel`/`.customPeopleLabels`. This type puts the two halves in one list so the
 * unresolved ones can be seen next to the resolved ones and fixed — which is the whole point of
 * the screen. `resolved` is exactly "did the import find a record", i.e. `key !== ''`.
 */
export interface DiaryReference {
  kind: DiaryReferenceKind;
  /**
   * Stable identity within one kind. A resolved reference is keyed by the record it points at
   * ('key:<okey>'), an unresolved one by its NORMALISED label ('label:<slug>') — the same
   * normalisation the import's resolver uses, so 'Zürich ZH' and 'Zuerich' aggregate into one
   * row rather than two that each look half-used.
   */
  id: string;
  /** What the list shows — the record's name when resolved, the raw diary text when not. */
  label: string;
  /** okey of the LocationModel / PersonModel; '' while unresolved. */
  key: string;
  resolved: boolean;
  /** The diaries mentioning it, newest first. */
  usages: DiaryUsage[];
}

function usageOf(diary: DiaryModel): DiaryUsage {
  return { okey: diary.okey, date: diary.date, title: diary.title };
}

/**
 * Adds one mention to the accumulator, creating the row on first sight. Later mentions only
 * append a usage: the label of the first one wins, so a resolved row keeps the record's name.
 */
function addMention(
  into: Map<string, DiaryReference>,
  kind: DiaryReferenceKind,
  id: string,
  label: string,
  key: string,
  diary: DiaryModel,
): void {
  const existing = into.get(id);
  if (existing) {
    existing.usages.push(usageOf(diary));
    return;
  }
  into.set(id, { kind, id, label, key, resolved: key.length > 0, usages: [usageOf(diary)] });
}

/**
 * Every place the given diaries mention, resolved and unresolved together.
 *
 * `DiaryModel.places` is deliberately NOT folded in: it is a separate slug vocabulary with no
 * resolved counterpart in the model, so a "map to location" on one of its entries would have
 * nowhere to write. Only `location` (resolved) and `customLocationLabel` (not) are two halves
 * of the same field.
 */
export function collectLocationReferences(diaries: DiaryModel[]): DiaryReference[] {
  const byId = new Map<string, DiaryReference>();
  for (const diary of diaries) {
    const resolved = diary.location;
    if (resolved?.key) {
      addMention(byId, 'location', `key:${resolved.key}`, resolved.label || resolved.name1, resolved.key, diary);
      continue;
    }
    const label = (diary.customLocationLabel ?? '').trim();
    if (label) {
      addMention(byId, 'location', `label:${normaliseLocationLabel(label)}`, label, '', diary);
    }
  }
  return sortReferences([...byId.values()]);
}

/** Every person the given diaries mention, resolved (`people`) and unresolved (`customPeopleLabels`). */
export function collectPersonReferences(diaries: DiaryModel[]): DiaryReference[] {
  const byId = new Map<string, DiaryReference>();
  for (const diary of diaries) {
    for (const person of diary.people ?? []) {
      if (!person?.key) continue;
      const label = person.label || `${person.name1} ${person.name2}`.trim();
      addMention(byId, 'person', `key:${person.key}`, label, person.key, diary);
    }
    for (const raw of diary.customPeopleLabels ?? []) {
      const label = (raw ?? '').trim();
      if (!label) continue;
      addMention(byId, 'person', `label:${label.toLowerCase()}`, label, '', diary);
    }
  }
  return sortReferences([...byId.values()]);
}

/**
 * Unresolved first — they are the work list; the resolved rows are only there for context and
 * for the occasional wrong match. Alphabetical within each half.
 */
function sortReferences(references: DiaryReference[]): DiaryReference[] {
  for (const reference of references) {
    reference.usages.sort((a, b) => b.date.localeCompare(a.date));
  }
  return references.sort((a, b) =>
    a.resolved === b.resolved
      ? a.label.localeCompare(b.label, 'de')
      : Number(a.resolved) - Number(b.resolved));
}

/** Applies the list's two filters. An empty search term matches everything. */
export function filterDiaryReferences(
  references: DiaryReference[],
  searchTerm: string,
  filter: DiaryReferenceFilter,
): DiaryReference[] {
  const term = searchTerm.toLowerCase().trim();
  return references.filter(reference => {
    if (filter === 'resolved' && !reference.resolved) return false;
    if (filter === 'unresolved' && reference.resolved) return false;
    return !term || reference.label.toLowerCase().includes(term);
  });
}

/**
 * A `DiaryModel.date` as a human reads it. The field is `yyyyMMdd` but NOT always a calendar
 * date: a month aggregate is `20041000` and a year aggregate `19900000` (see `DiaryScope`), so
 * the zeroed components are dropped instead of being rendered as day 0. Never feed this field to
 * date arithmetic — that is exactly what this avoids.
 */
export function formatDiaryDate(date: string): string {
  if (!/^\d{8}$/.test(date)) return date;
  const [year, month, day] = [date.slice(0, 4), date.slice(4, 6), date.slice(6, 8)];
  if (day !== '00') return `${day}.${month}.${year}`;
  if (month !== '00') return `${month}.${year}`;
  return year;
}

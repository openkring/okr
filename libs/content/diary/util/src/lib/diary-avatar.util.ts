import { AvatarInfo, DiaryModel } from '@okr/shared-models';

import { normaliseLocationLabel } from './location-normalise';

/** The four fields that `locations` / `people` replace (spec 1.117); no longer part of `DiaryModel`. */
export const LEGACY_DIARY_FIELDS = ['location', 'customLocationLabel', 'places', 'customPeopleLabels'] as const;

/**
 * The shape of the four fields on a `diaries` document written before spec 1.117. Only the
 * migration (`migrateDiaryReferences`, scripts/migrate-diary-locations.mjs) and the read-side shim
 * `withDiaryLocations` read them.
 */
export interface LegacyDiaryFields {
  location?: AvatarInfo | null;
  customLocationLabel?: string;
  places?: string[];
  customPeopleLabels?: string[];
}

function collapseWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

/** A free-text location (key ''): the text lives in name1 and label. */
export function customLocationAvatar(label: string): AvatarInfo {
  const text = collapseWhitespace(label);
  return { key: '', name1: text, name2: '', label: text, modelType: 'location', type: '', subType: '' };
}

/** A free-text person (key ''), split like ModelSelectService.selectPersonAvatar: last word = name2. */
export function customPersonAvatar(label: string): AvatarInfo {
  const parts = collapseWhitespace(label).split(' ');
  const name1 = parts.length > 1 ? parts.slice(0, -1).join(' ') : '';
  const name2 = parts[parts.length - 1];
  return { key: '', name1, name2, label: '', modelType: 'person', type: '', subType: '' };
}

export function diaryAvatarName(a: AvatarInfo): string {
  return a.label || `${a.name1} ${a.name2}`.trim();
}

/**
 * Identity of an entry: its key when linked, else its normalised free text. A place name that
 * normalises to '' (Greek, Cyrillic, CJK, emoji only) falls back to its lower-cased text, so
 * such places do not all collapse into one entry.
 */
export function diaryAvatarId(a: AvatarInfo): string {
  if (a.key) return `key:${a.key}`;
  const name = diaryAvatarName(a);
  const plain = name.trim().toLowerCase();
  return a.modelType === 'location' ? `label:${normaliseLocationLabel(name) || plain}` : `label:${plain}`;
}

export function addDiaryAvatar(list: AvatarInfo[], a: AvatarInfo): AvatarInfo[] {
  const id = diaryAvatarId(a);
  return list.some((x) => diaryAvatarId(x) === id) ? list : [...list, a];
}

/**
 * Replaces the entry with `id` by `a`, at the replaced entry's position (so linking never moves
 * the main location). If `a`'s id already occurs elsewhere in the list, that other occurrence is removed.
 */
export function replaceDiaryAvatar(list: AvatarInfo[], id: string, a: AvatarInfo): AvatarInfo[] {
  const newId = diaryAvatarId(a);
  const index = list.findIndex((x) => diaryAvatarId(x) === id);
  if (index < 0) return list;
  return list
    .map((x, i) => (i === index ? a : x))
    .filter((x, i) => i === index || diaryAvatarId(x) !== newId);
}

/** The main location (Hauptort) is the first entry. */
export function mainLocation(d: Pick<DiaryModel, 'locations'>): AvatarInfo | undefined {
  return d.locations?.[0];
}

/** True for a document that predates spec 1.117: no `locations` yet, but at least one legacy field. */
export function needsDiaryLocationMigration(raw: object): boolean {
  const record = raw as Record<string, unknown>;
  if (record['locations'] !== undefined && record['locations'] !== null) return false;
  return LEGACY_DIARY_FIELDS.some(k => k in record);
}

/** An entry without a key and without a name carries nothing and is dropped. Tolerates a partial object. */
function isEmptyAvatar(a: Partial<AvatarInfo>): boolean {
  return !a.key && !(a.label || `${a.name1 ?? ''} ${a.name2 ?? ''}`).trim();
}

/**
 * Maps the legacy fields to `locations` / `people` (spec 1.117 D6): the main location first
 * (`location`, else `customLocationLabel`), then every `places[]` entry, in order; then the
 * free-text persons appended to `people`. Each free-text location label is offered to
 * `resolveLocation` first; a hit replaces it, otherwise it stays free text with its text unchanged.
 * Duplicates are dropped by `diaryAvatarId`, so a resolved place that names the main location
 * collapses into it. Blank labels are skipped.
 *
 * scripts/migrate-diary-locations.mjs carries a fingerprinted copy of this function — change both.
 */
export function migrateDiaryReferences(
  raw: Partial<Pick<DiaryModel, 'people'>> & LegacyDiaryFields,
  resolveLocation: (label: string) => AvatarInfo | undefined,
): { locations: AvatarInfo[]; people: AvatarInfo[] } {
  const fromText = (label: string): AvatarInfo | undefined =>
    label.trim() ? (resolveLocation(label) ?? customLocationAvatar(label)) : undefined;

  let locations: AvatarInfo[] = [];
  // A present but empty `location` object falls through to `customLocationLabel`.
  const main = raw.location && !isEmptyAvatar(raw.location) ? raw.location : fromText(raw.customLocationLabel ?? '');
  if (main && !isEmptyAvatar(main)) locations = addDiaryAvatar(locations, main);
  for (const place of raw.places ?? []) {
    const avatar = fromText(place ?? '');
    if (avatar && !isEmptyAvatar(avatar)) locations = addDiaryAvatar(locations, avatar);
  }

  let people = raw.people ?? [];
  for (const label of raw.customPeopleLabels ?? []) {
    if ((label ?? '').trim()) people = addDiaryAvatar(people, customPersonAvatar(label));
  }
  return { locations, people };
}

/**
 * Read-side shim: derives `locations` / `people` from the legacy fields on a document that
 * predates spec 1.117 (no resolving — that is the migration's job). Delete the legacy branch once
 * the migration has run on every document.
 */
export function withDiaryLocations<T extends DiaryModel>(raw: T): T {
  if (raw.locations) return { ...raw, people: raw.people ?? [] };
  return { ...raw, ...migrateDiaryReferences(raw as T & LegacyDiaryFields, () => undefined) };
}

export function stripLegacyDiaryFields<T extends object>(d: T): T {
  const copy = { ...d } as Record<string, unknown>;
  for (const k of LEGACY_DIARY_FIELDS) delete copy[k];
  return copy as T;
}

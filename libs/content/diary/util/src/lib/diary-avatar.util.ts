import { AvatarInfo, DiaryModel } from '@okr/shared-models';

import { normaliseLocationLabel } from './location-normalise';

/** The four fields that `locations` / `people` replace (spec 1.117); removed from the model in Task 8. */
export const LEGACY_DIARY_FIELDS = ['location', 'customLocationLabel', 'places', 'customPeopleLabels'] as const;

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

/** Identity of an entry: its key when linked, else its normalised free text. */
export function diaryAvatarId(a: AvatarInfo): string {
  if (a.key) return `key:${a.key}`;
  const name = diaryAvatarName(a);
  return a.modelType === 'location' ? `label:${normaliseLocationLabel(name)}` : `label:${name.trim().toLowerCase()}`;
}

export function addDiaryAvatar(list: AvatarInfo[], a: AvatarInfo): AvatarInfo[] {
  const id = diaryAvatarId(a);
  return list.some((x) => diaryAvatarId(x) === id) ? list : [...list, a];
}

/** Replaces the entry with `id` in place; drops it instead when `a` is already elsewhere in the list. */
export function replaceDiaryAvatar(list: AvatarInfo[], id: string, a: AvatarInfo): AvatarInfo[] {
  const newId = diaryAvatarId(a);
  const exists = list.some((x) => diaryAvatarId(x) !== id && diaryAvatarId(x) === newId);
  return exists
    ? list.filter((x) => diaryAvatarId(x) !== id)
    : list.map((x) => (diaryAvatarId(x) === id ? a : x));
}

/** The main location (Hauptort) is the first entry. */
export function mainLocation(d: Pick<DiaryModel, 'locations'>): AvatarInfo | undefined {
  return d.locations?.[0];
}

/** Read-side shim: derives `locations` / `people` from the legacy fields on a document that predates spec 1.117. */
export function withDiaryLocations<T extends DiaryModel>(raw: T): T {
  if (raw.locations) return { ...raw, people: raw.people ?? [] };

  let locations: AvatarInfo[] = [];
  const main = raw.location ?? (raw.customLocationLabel ? customLocationAvatar(raw.customLocationLabel) : undefined);
  if (main) locations = addDiaryAvatar(locations, main);
  for (const p of raw.places ?? []) locations = addDiaryAvatar(locations, customLocationAvatar(p));

  let people = raw.people ?? [];
  for (const p of raw.customPeopleLabels ?? []) people = addDiaryAvatar(people, customPersonAvatar(p));
  return { ...raw, locations, people };
}

export function stripLegacyDiaryFields<T extends object>(d: T): T {
  const copy = { ...d } as Record<string, unknown>;
  for (const k of LEGACY_DIARY_FIELDS) delete copy[k];
  return copy as T;
}

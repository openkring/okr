import { AvatarInfo, DiaryModel, LocationModel } from '@okr/shared-models';

import { normaliseLocationLabel } from './location-normalise';

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

/**
 * Fills the two avatar lists a document read from Firestore may lack (reads skip model defaults).
 * Every `diaries` document carries `locations` since the spec 1.117 migration (2026-10-24, verified
 * 2026-10-31), so there is no legacy mapping left here.
 */
export function withDiaryLocations<T extends DiaryModel>(raw: T): T {
  return { ...raw, locations: raw.locations ?? [], people: raw.people ?? [] };
}

/** The avatar of a predefined location (keyed by its okey). */
export function locationAvatar(l: LocationModel): AvatarInfo {
  return { key: l.okey, name1: l.name, name2: '', label: l.name, modelType: 'location', type: l.type ?? '', subType: '' };
}

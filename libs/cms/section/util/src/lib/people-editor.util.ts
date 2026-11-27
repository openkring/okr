import { applyPeopleOverrides, cleanPeopleConfig, isSameValue, PEOPLE_SECTION_SHAPE, type AvatarInfo, type PeopleConfig, type PeopleSection } from '@okr/shared-models';

import { normalizeAvatarConfig } from './people-section.util';

/**
 * The rules of the people block editor (spec 1.181 §7), without Angular and Ionic: opening, comparing and saving a people section.
 * Nothing is mutated.
 */

/** A step of the people editor's history: the section and the person selected in the canvas. */
export interface PeopleEditorState { section: PeopleSection; selectedKey?: string }

// ------------------------------------------------------- opening -------------------------------------------------------

/** Fields the suite requires, with what their absence means to readers ('' is no role). */
const FIELD_DEFAULTS = {
  name: '', title: '', subTitle: '', index: '', notes: '', tags: '', roleNeeded: '', isArchived: false, color: PEOPLE_SECTION_SHAPE.color,
} as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The section as the editor starts with it: what a read lacks (reads apply no model defaults) is filled in, a stored value is never
 * changed. Old look fields, `excludedPersons` and fields of other sources stay as they are; `preparePeopleForSave` cleans them.
 */
export function openPeopleSection(section: PeopleSection): PeopleSection {
  const stored = section as unknown as Record<string, unknown>;
  const missing = Object.entries(FIELD_DEFAULTS).filter(([key]) => stored[key] === undefined || stored[key] === null);
  const props: Partial<PeopleConfig> = isObject(section.properties) ? section.properties : {};
  const properties: PeopleConfig = {
    ...props,
    type: props.type ?? 'persons',
    persons: Array.isArray(props.persons) ? props.persons : [],
    avatar: isObject(props.avatar) ? props.avatar : normalizeAvatarConfig(undefined),
  };
  return { ...section, ...Object.fromEntries(missing), properties } as PeopleSection;
}

// ------------------------------------------------------- comparing -------------------------------------------------------

/** The top-level fields that are compared: what the editor can change. `index`, `okey` and `tenants` do not count. */
export const PEOPLE_COMPARED_FIELDS = [
  'type', 'state', 'name', 'title', 'subTitle', 'intro', 'introPosition', 'color', 'colSize', 'roleNeeded', 'isArchived', 'content', 'notes', 'tags',
] as const;

/** Absent, undefined, null, '' and [] are one value at field level. */
function normalisedField(value: unknown): unknown {
  return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0) ? undefined : value;
}

/** Every person key a config refers to: comparing with all of them drops nothing as stale. */
function referencedKeys(config: Partial<PeopleConfig>): string[] {
  const keys = (list: unknown): string[] => (Array.isArray(list) ? list : [])
    .map((item: unknown) => (typeof item === 'string' ? item : isObject(item) ? item['key'] : undefined))
    .filter((key): key is string => typeof key === 'string');
  return [...keys(config.persons), ...keys(config.excludedPersons), ...keys(config.hiddenKeys), ...keys(config.orderKeys)];
}

/** The config as it is saved, with the avatar normalized first: the retired flags keep their meaning, every look field is filled. */
function cleaned(config: PeopleConfig, shownKeys: readonly string[]): PeopleConfig {
  return cleanPeopleConfig({ ...config, avatar: normalizeAvatarConfig(config.avatar) }, shownKeys);
}

/**
 * Whether the editor's section differs from the one as opened. The configs are compared as they would be saved (`cleanPeopleConfig`,
 * with the same keys for both), so that an untouched legacy section, whose stored shape differs from the cleaned one, is unchanged;
 * a hide and a show again, or a look written in full that draws the same, is no change either.
 */
export function isPeopleSectionChanged(opened: PeopleSection, now: PeopleSection): boolean {
  if (opened === now) return false;
  const [left, right] = [opened as unknown as Record<string, unknown>, now as unknown as Record<string, unknown>];
  const sameFields = PEOPLE_COMPARED_FIELDS.every((key) => isSameValue(normalisedField(left[key]), normalisedField(right[key])));
  if (!sameFields) return true;
  const keys = [...new Set([...referencedKeys(opened.properties), ...referencedKeys(now.properties)])];
  return !isSameValue(cleaned(opened.properties, keys), cleaned(now.properties, keys));
}

// ------------------------------------------------------- saving -------------------------------------------------------

/**
 * The section to write (§7.5): the new look fields, no old ones, no fields of other sources, `excludedPersons` moved to `hiddenKeys`
 * and the overrides without keys that no longer occur.
 * @param shownKeys every person the source gives now, the hidden ones included (the store's `allPersons`). Only complete once the
 *        source is loaded: before, every override would be dropped
 * @param naturalKeys the source's own order (the store's `sourcePersons`); an `orderKeys` that draws it is dropped
 */
export function preparePeopleForSave(section: PeopleSection, shownKeys: readonly string[], naturalKeys?: readonly string[]): PeopleSection {
  const properties = cleaned(section.properties, shownKeys);
  if (naturalKeys && properties.orderKeys) {
    // an order that draws the source's own order pins nothing: dropped, so a later reorder of the source reaches this section
    const drawn = applyPeopleOverrides(naturalKeys.map((key) => ({ key })), { ...properties, hiddenKeys: [] }).map((p) => p.key);
    if (drawn.length === naturalKeys.length && drawn.every((key, i) => key === naturalKeys[i])) delete properties.orderKeys;
  }
  return { ...section, properties };
}

// ------------------------------------------------------- typing -------------------------------------------------------

/** Texts of the avatar that are typed into. */
const AVATAR_TEXTS: readonly string[] = ['altText', 'linkedSection', 'title'];

function changedKeys(a: Record<string, unknown>, b: Record<string, unknown>): string[] {
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((key) => a[key] !== b[key] && !isSameValue(a[key], b[key]));
}

const isText = (value: unknown): boolean => value === undefined || typeof value === 'string';

/**
 * The history tag of a change that is typing in one text field, so that a run of typing in it is one step (`record`): `section:<field>`,
 * `avatar:<field>` or `label:<person key>` (the function of a hand-picked person). undefined for any other change.
 */
export function peopleTypingTag(before: PeopleSection, after: PeopleSection): string | undefined {
  const [left, right] = [before as unknown as Record<string, unknown>, after as unknown as Record<string, unknown>];
  const top = changedKeys(left, right);
  if (top.length !== 1) return undefined;
  const [field] = top;
  if (field !== 'properties') return isText(left[field]) && isText(right[field]) ? `section:${field}` : undefined;

  const [was, is] = [before.properties as unknown as Record<string, unknown>, after.properties as unknown as Record<string, unknown>];
  const props = changedKeys(was, is);
  if (props.length !== 1) return undefined;
  if (props[0] === 'avatar') {
    const [a, b] = [(was['avatar'] ?? {}) as Record<string, unknown>, (is['avatar'] ?? {}) as Record<string, unknown>];
    const changed = changedKeys(a, b);
    return changed.length === 1 && AVATAR_TEXTS.includes(changed[0]) && isText(a[changed[0]]) && isText(b[changed[0]]) ? `avatar:${changed[0]}` : undefined;
  }
  if (props[0] === 'persons') return labelTag(before.properties.persons ?? [], after.properties.persons ?? []);
  return undefined;
}

function labelTag(before: AvatarInfo[], after: AvatarInfo[]): string | undefined {
  if (before.length !== after.length) return undefined;
  const changed = after.map((person, i) => ({ person, i })).filter(({ person, i }) => person !== before[i] && !isSameValue(person, before[i]));
  if (changed.length !== 1) return undefined;
  const { person, i } = changed[0];
  const fields = changedKeys(before[i] as unknown as Record<string, unknown>, person as unknown as Record<string, unknown>);
  return person.key === before[i].key && fields.length === 1 && fields[0] === 'label' ? `label:${person.key}` : undefined;
}

/** The avatar fields of «Mehr» that are typed into; `title` only when it is set. */
export type PeopleAvatarText = 'altText' | 'linkedSection' | 'title';

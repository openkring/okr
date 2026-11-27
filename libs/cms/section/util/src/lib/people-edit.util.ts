import type { AvatarInfo, PeopleConfig, PeopleLook } from '@okr/shared-models';
import { peopleHiddenKeys } from '@okr/shared-models';

/** The source of a people section. */
export type PeopleSourceType = PeopleConfig['type'];

/** Drops `hiddenKeys` / `orderKeys` when empty (an empty list is never stored). */
function tidy(config: PeopleConfig): PeopleConfig {
  const out = { ...config };
  if (!out.hiddenKeys?.length) delete out.hiddenKeys;
  if (!out.orderKeys?.length) delete out.orderKeys;
  return out;
}

/** The responsibility ids, with the deprecated single `responsibilityId` folded in. */
function responsibilityIdsOf(config: PeopleConfig): string[] {
  const ids = [...(config.responsibilityIds ?? [])];
  if (config.responsibilityId && !ids.includes(config.responsibilityId)) ids.unshift(config.responsibilityId);
  return ids;
}

/** Changing the source clears the overrides (they are keyed to the old source's persons); the same source is a no-op. */
export function setPeopleSource(config: PeopleConfig, type: PeopleSourceType): PeopleConfig {
  if (config.type === type) return { ...config };
  const out: PeopleConfig = { ...config, type };
  delete out.hiddenKeys;
  delete out.orderKeys;
  return out;
}

export function addPeoplePerson(config: PeopleConfig, avatar: AvatarInfo): PeopleConfig {
  if (config.persons.some((p) => p.key === avatar.key)) return { ...config };
  return { ...config, persons: [...config.persons, avatar] };
}

export function removePeoplePerson(config: PeopleConfig, key: string): PeopleConfig {
  if (config.type !== 'persons') return { ...config };
  return tidy({ ...config, persons: config.persons.filter((p) => p.key !== key), hiddenKeys: (config.hiddenKeys ?? []).filter((k) => k !== key) });
}

/** Another group clears the overrides and the stale exclusions; the same group changes nothing. */
export function setPeopleGroup(config: PeopleConfig, groupId: string): PeopleConfig {
  if (config.groupId === groupId) return { ...config };
  const out: PeopleConfig = { ...config, groupId };
  delete out.hiddenKeys;
  delete out.orderKeys;
  delete out.excludedPersons;
  return out;
}

export function addPeopleResponsibility(config: PeopleConfig, id: string): PeopleConfig {
  const ids = responsibilityIdsOf(config);
  if (!ids.includes(id)) ids.push(id);
  const out: PeopleConfig = { ...config, responsibilityIds: ids };
  delete out.responsibilityId;
  return out;
}

export function removePeopleResponsibility(config: PeopleConfig, id: string): PeopleConfig {
  const out: PeopleConfig = { ...config, responsibilityIds: responsibilityIdsOf(config).filter((i) => i !== id) };
  delete out.responsibilityId;
  return out;
}

export function setPeopleResponsibilityParent(config: PeopleConfig, key: string, name: string): PeopleConfig {
  return { ...config, responsibilityParentKey: key, responsibilityParentName: name };
}

export function clearPeopleResponsibilityParent(config: PeopleConfig): PeopleConfig {
  const out = { ...config };
  delete out.responsibilityParentKey;
  delete out.responsibilityParentName;
  return out;
}

export function setPeoplePersonLabel(config: PeopleConfig, key: string, label: string): PeopleConfig {
  if (config.type !== 'persons') return { ...config };
  return { ...config, persons: config.persons.map((p) => (p.key === key ? { ...p, label } : p)) };
}

export function hidePeoplePerson(config: PeopleConfig, key: string): PeopleConfig {
  if (peopleHiddenKeys(config).includes(key)) return { ...config };
  return { ...config, hiddenKeys: [...(config.hiddenKeys ?? []), key] };
}

/** Also clears the key from the stale `excludedPersons` of a group section. */
export function showPeoplePerson(config: PeopleConfig, key: string): PeopleConfig {
  const out: PeopleConfig = { ...config, hiddenKeys: (config.hiddenKeys ?? []).filter((k) => k !== key) };
  if (config.excludedPersons) out.excludedPersons = config.excludedPersons.filter((p) => p?.key !== key);
  if (!out.excludedPersons?.length) delete out.excludedPersons;
  return tidy(out);
}

export function showAllPeople(config: PeopleConfig): PeopleConfig {
  const out = { ...config };
  delete out.hiddenKeys;
  delete out.excludedPersons;
  return out;
}

/**
 * Moves `key` by `delta` within `shownKeys` (the drawn order, hidden ones included). Out of range: no change.
 * @param naturalKeys the source's own order (group `sortOrder`, responsibilities): a new order equal to it stores no `orderKeys`, so
 *        that a later reorder of the source still reaches this section
 */
export function movePeoplePerson(config: PeopleConfig, shownKeys: readonly string[], key: string, delta: -1 | 1, naturalKeys?: readonly string[]): PeopleConfig {
  const from = shownKeys.indexOf(key);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= shownKeys.length) return { ...config };
  const order = [...shownKeys];
  [order[from], order[to]] = [order[to], order[from]];
  if (config.type === 'persons') {
    const rank = (k: string): number => {
      const i = order.indexOf(k);
      return i < 0 ? order.length : i;
    };
    return { ...config, persons: [...config.persons].sort((a, b) => rank(a.key) - rank(b.key)) };
  }
  if (naturalKeys && isSameOrder(order, naturalKeys)) {
    const out = { ...config };
    delete out.orderKeys;
    return out;
  }
  return { ...config, orderKeys: order };
}

function isSameOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((k, i) => k === b[i]);
}

/** Writes the changed of size, shape, fill, textPosition and grayscale into `avatar`, keeping its other fields. */
export function setPeopleLook(config: PeopleConfig, patch: Partial<PeopleLook>): PeopleConfig {
  const avatar = { ...config.avatar };
  if (patch.size !== undefined) avatar.size = patch.size;
  if (patch.shape !== undefined) avatar.shape = patch.shape;
  if (patch.fill !== undefined) avatar.fill = patch.fill;
  if (patch.textPosition !== undefined) avatar.textPosition = patch.textPosition;
  if (patch.grayscale !== undefined) avatar.grayscale = patch.grayscale;
  return { ...config, avatar };
}

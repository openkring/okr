import type { SectionDoc } from './section-mapper';

/**
 * Where a website people section takes its persons from when they are resolved at publish / read time
 * (spec 1.153 §13 and §13.1): the members of a group, or the holders of one or more roles.
 * An explicit `persons` list (type 'persons') has no source: it is mapped from the stored list.
 */
export type PeopleSource =
  | { kind: 'group'; groupId: string }
  | { kind: 'responsibility'; ids: string[]; parentKey?: string };

/** A Firestore document id that can be read by key (no path separator). */
function isDocId(id: unknown): id is string {
  return typeof id === 'string' && !!id.trim() && !id.includes('/');
}

/**
 * The source of a people section, or undefined for every other section and for explicit persons lists.
 * Roles: `responsibilityIds` in order (deduped); a legacy single `responsibilityId` is a list of one
 * (as the app's `getPeopleResponsibilityIds`), plus `responsibilityParentKey` ('group.<okey>'), whose
 * active roles follow the listed ones (resolved by the loader, see `roleIdsUnderParent`).
 */
export function peopleSourceOf(section: SectionDoc | undefined): PeopleSource | undefined {
  if (section?.type !== 'people') return undefined;
  const props = (section.properties ?? {}) as Record<string, unknown>;
  if (props['type'] === 'group') {
    const groupId = props['groupId'];
    return isDocId(groupId) ? { kind: 'group', groupId: groupId.trim() } : undefined;
  }
  if (props['type'] === 'responsibility') {
    const listed = Array.isArray(props['responsibilityIds'])
      ? (props['responsibilityIds'] as unknown[]).filter((id) => typeof id === 'string' && !!id.trim()) as string[]
      : [];
    const legacy = typeof props['responsibilityId'] === 'string' ? props['responsibilityId'].trim() : '';
    const raw = listed.length > 0 ? listed.map((id) => id.trim()) : (legacy ? [legacy] : []);
    const ids = [...new Set(raw)].filter(isDocId);
    const parent = typeof props['responsibilityParentKey'] === 'string' ? props['responsibilityParentKey'].trim() : '';
    const parentKey = isDocId(parent) ? parent : '';
    if (ids.length === 0 && !parentKey) return undefined;
    return parentKey ? { kind: 'responsibility', ids, parentKey } : { kind: 'responsibility', ids };
  }
  return undefined;
}

/**
 * The person keys a group people section hides (`excludedPersons`, the app's getPeopleExcludedKeys):
 * only for type 'group'; trimmed, deduped, non-string and empty keys dropped. The group's members are
 * resolved once per group and shared by every section of that group, so the filter is per section.
 */
export function peopleExcludedKeys(section: SectionDoc | undefined): string[] {
  if (section?.type !== 'people') return [];
  const props = (section.properties ?? {}) as Record<string, unknown>;
  if (props['type'] !== 'group' || !Array.isArray(props['excludedPersons'])) return [];
  const keys = (props['excludedPersons'] as unknown[])
    .map((p) => (p && typeof p === 'object' ? (p as { key?: unknown }).key : undefined))
    .filter((k): k is string => typeof k === 'string' && !!k.trim())
    .map((k) => k.trim());
  return [...new Set(keys)];
}

/**
 * The key of a source in the people map that `mapSection` / `renderSite` read: `group.<id>`,
 * `responsibility.<id>,<id>` or, with a parent, `responsibility.<id>,<id>|<parentKey>`.
 */
export function peopleSourceKey(source: PeopleSource): string {
  if (source.kind === 'group') return `group.${source.groupId}`;
  const ids = `responsibility.${source.ids.join(',')}`;
  return source.parentKey ? `${ids}|${source.parentKey}` : ids;
}

import type { SectionDoc } from './section-mapper';

/**
 * Where a website people section takes its persons from when they are resolved at publish / read time
 * (spec 1.153 §13 and §13.1): the members of a group, or the holders of one or more roles.
 * An explicit `persons` list (type 'persons') has no source: it is mapped from the stored list.
 */
export type PeopleSource =
  | { kind: 'group'; groupId: string }
  | { kind: 'responsibility'; ids: string[] };

/** A Firestore document id that can be read by key (no path separator). */
function isDocId(id: unknown): id is string {
  return typeof id === 'string' && !!id.trim() && !id.includes('/');
}

/**
 * The source of a people section, or undefined for every other section and for explicit persons lists.
 * Roles: `responsibilityIds` in order (deduped); a legacy single `responsibilityId` is a list of one
 * (as the app's `getPeopleResponsibilityIds`).
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
    return ids.length > 0 ? { kind: 'responsibility', ids } : undefined;
  }
  return undefined;
}

/** The key of a source in the people map that `mapSection` / `renderSite` read: `group.<id>` or `responsibility.<id>,<id>`. */
export function peopleSourceKey(source: PeopleSource): string {
  return source.kind === 'group' ? `group.${source.groupId}` : `responsibility.${source.ids.join(',')}`;
}

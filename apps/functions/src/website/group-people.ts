// People sections from a group or from roles (spec 1.153 §13, §13.1): the Firestore side of
// resolveGroupPeople / resolveRolePeople, shared by publishWebsite and publicApi's page route so both
// resolve a people section the same way.
import type { Firestore } from 'firebase-admin/firestore';
import { AvatarCollection, MembershipCollection, PersonCollection, ResponsibilityCollection, ResponsibilityModelName } from '@okr/shared-models';
import {
  peopleSourceKey, peopleSourceOf, resolveGroupPeople, resolveRolePeople,
  type GroupMembershipDoc, type GroupPersonDoc, type PublicPerson, type RoleDoc, type SectionDoc,
} from '@okr/cms-website-render';
import { DateFormat, getTodayStr } from '@okr/shared-util-core';

const GET_ALL_CHUNK = 100;
/** Firestore's limit for array-contains-any. */
const MAX_TENANTS = 30;

/** Reads docs of `collection` by key in getAll batches; key → data (missing docs left out). */
async function readByKeys<T>(db: Firestore, collection: string, keys: string[]): Promise<Map<string, T>> {
  const out = new Map<string, T>();
  const ids = [...new Set(keys)].filter((k) => !!k && !k.includes('/'));
  for (let i = 0; i < ids.length; i += GET_ALL_CHUNK) {
    const refs = ids.slice(i, i + GET_ALL_CHUNK).map((k) => db.collection(collection).doc(k));
    for (const snap of await db.getAll(...refs)) {
      const data = snap.data();
      if (data) out.set(snap.id, data as T);
    }
  }
  return out;
}

/**
 * The public members of each group (key → resolveGroupPeople). One tenant-scoped memberships query per
 * group — it matches the composite index (tenants CONTAINS, isArchived, memberModelType, orgKey,
 * orgModelType, memberName2) — then the members' persons by key, in getAll batches.
 */
export async function loadGroupPeople(
  db: Firestore,
  groupIds: string[],
  siteTenants: string[],
  today = getTodayStr(DateFormat.StoreDate),
): Promise<Map<string, PublicPerson[]>> {
  const out = new Map<string, PublicPerson[]>();
  const ids = [...new Set(groupIds.filter((id) => !!id && !id.includes('/')))];
  const tenants = siteTenants.filter(Boolean).slice(0, MAX_TENANTS);
  if (ids.length === 0 || tenants.length === 0) return out;

  const perGroup = await Promise.all(ids.map(async (groupId) => {
    const snap = await db.collection(MembershipCollection)
      .where('tenants', 'array-contains-any', tenants)
      .where('isArchived', '==', false)
      .where('memberModelType', '==', 'person')
      .where('orgKey', '==', groupId)
      .where('orgModelType', '==', 'group')
      .orderBy('memberName2', 'asc')
      .get();
    return { groupId, memberships: snap.docs.map((d) => d.data() as GroupMembershipDoc) };
  }));

  const keys = perGroup.flatMap((g) => g.memberships.map((m) => m.memberKey))
    .filter((k): k is string => typeof k === 'string');
  const persons = await readByKeys<GroupPersonDoc>(db, PersonCollection, keys);

  for (const { groupId, memberships } of perGroup) {
    out.set(groupId, resolveGroupPeople(groupId, memberships, persons, tenants, today));
  }
  return out;
}

/**
 * The public holders of each role list (`ids.join(',')` → resolveRolePeople): the roles by key, then
 * the persons of their responsible / delegate avatars by key, and the roles' own portraits (avatar
 * `<tenant>.responsibility.<key>`), in getAll batches. Tenant,
 * archive and privacy filters are the resolver's.
 */
export async function loadRolePeople(
  db: Firestore,
  roleLists: string[][],
  siteTenants: string[],
): Promise<Map<string, PublicPerson[]>> {
  const out = new Map<string, PublicPerson[]>();
  const tenants = siteTenants.filter(Boolean);
  const lists = roleLists.filter((ids) => ids.length > 0);
  if (lists.length === 0 || tenants.length === 0) return out;

  const roles = await readByKeys<RoleDoc>(db, ResponsibilityCollection, lists.flat());
  const personKeys: string[] = [];
  for (const role of roles.values()) {
    for (const avatar of [role.responsibleAvatar, role.delegateAvatar]) {
      if (avatar?.modelType === 'person' && typeof avatar.key === 'string') personKeys.push(avatar.key);
    }
  }
  const persons = await readByKeys<GroupPersonDoc>(db, PersonCollection, personKeys);
  const portraits = await loadRolePortraits(db, [...roles.keys()], tenants[0]);
  for (const ids of lists) out.set(ids.join(','), resolveRolePeople(ids, roles, persons, tenants, portraits));
  return out;
}

/**
 * role key → storage path of the role's own portrait (the avatar the responsibility edit modal uploads):
 * the tenant's avatar doc `<tenant>.responsibility.<key>`. Only a storage path under that role's own
 * upload folder (`tenant/<tenant>/responsibility/<key>/`) is trusted — both are writable by the
 * privileged only (firestore.rules canWriteAvatar, storage.rules). Roles without a portrait are left out.
 */
export async function loadRolePortraits(db: Firestore, roleKeys: string[], tenantId: string | undefined): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (roleKeys.length === 0 || !tenantId) return out;
  const docId = (k: string) => `${tenantId}.${ResponsibilityModelName}.${k}`;
  const avatars = await readByKeys<{ storagePath?: string }>(db, AvatarCollection, roleKeys.map(docId));
  for (const k of roleKeys) {
    const path = avatars.get(docId(k))?.storagePath;
    if (path && path.startsWith(`tenant/${tenantId}/${ResponsibilityModelName}/${k}/`)) out.set(k, path);
  }
  return out;
}

/**
 * The public persons of every group / role people section among `sections`, keyed by
 * `peopleSourceKey` — the map mapSection and renderSite read. Explicit persons lists need no read.
 */
export async function loadSectionPeople(
  db: Firestore,
  sections: (SectionDoc | undefined)[],
  siteTenants: string[],
  today = getTodayStr(DateFormat.StoreDate),
): Promise<Map<string, PublicPerson[]>> {
  const groupIds = new Set<string>();
  const roleLists = new Map<string, string[]>();
  for (const section of sections) {
    const source = peopleSourceOf(section);
    if (source?.kind === 'group') groupIds.add(source.groupId);
    if (source?.kind === 'responsibility') roleLists.set(source.ids.join(','), source.ids);
  }
  const [groups, roles] = await Promise.all([
    loadGroupPeople(db, [...groupIds], siteTenants, today),
    loadRolePeople(db, [...roleLists.values()], siteTenants),
  ]);
  const out = new Map<string, PublicPerson[]>();
  for (const [groupId, persons] of groups) out.set(peopleSourceKey({ kind: 'group', groupId }), persons);
  for (const ids of roleLists.values()) {
    const persons = roles.get(ids.join(','));
    if (persons) out.set(peopleSourceKey({ kind: 'responsibility', ids }), persons);
  }
  return withAvatarImages(db, out, siteTenants[0]);
}

/**
 * Adds each person's avatar storage path (`image`) — only where `showImage` is true (the person's
 * `usageImages` is Public; both resolvers set it). Fails closed: a person without the flag gets no photo. The app's lookup: the tenant's own avatar `<tenant>.person.<key>`, else the
 * shared `person.<key>`. Missing avatars leave `image` unset (the site shows initials).
 */
export async function withAvatarImages(
  db: Firestore,
  people: Map<string, PublicPerson[]>,
  tenantId: string | undefined,
): Promise<Map<string, PublicPerson[]>> {
  // a person who already has an image (a role's own portrait, resolveRolePeople) keeps it
  const keys = [...new Set([...people.values()].flat().filter((p) => p.showImage === true && !!p.key && !p.image).map((p) => p.key))];
  if (keys.length === 0) return people;
  const own = tenantId ? await readByKeys<{ storagePath?: string }>(db, AvatarCollection, keys.map((k) => `${tenantId}.person.${k}`)) : new Map();
  const shared = await readByKeys<{ storagePath?: string }>(db, AvatarCollection, keys.map((k) => `person.${k}`));
  const pathOf = (key: string): string | undefined =>
    (tenantId ? own.get(`${tenantId}.person.${key}`)?.storagePath : undefined) || shared.get(`person.${key}`)?.storagePath || undefined;
  const out = new Map<string, PublicPerson[]>();
  for (const [source, persons] of people) {
    out.set(source, persons.map((p) => {
      if (p.image) return p;
      const image = p.showImage === true ? pathOf(p.key) : undefined;
      return image ? { ...p, image } : p;
    }));
  }
  return out;
}

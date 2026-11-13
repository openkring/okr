// People sections from a group or from roles (spec 1.153 §13, §13.1): the Firestore side of
// resolveGroupPeople / resolveRolePeople, shared by publishWebsite and publicApi's page route so both
// resolve a people section the same way.
import type { Firestore } from 'firebase-admin/firestore';
import { MembershipCollection, PersonCollection, ResponsibilityCollection } from '@okr/shared-models';
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
 * the persons of their responsible / delegate avatars by key, in getAll batches. Tenant, archive and
 * privacy filters are the resolver's.
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
  for (const ids of lists) out.set(ids.join(','), resolveRolePeople(ids, roles, persons, tenants));
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
  return out;
}

// People sections from a group or from roles (spec 1.153 §13, §13.1): the Firestore side of
// resolveGroupPeople / resolveRolePeople, shared by publishWebsite and publicApi's page route so both
// resolve a people section the same way.
import type { Firestore } from 'firebase-admin/firestore';
import { AvatarCollection, GroupCollection, MembershipCollection, PersonCollection, ResponsibilityCollection, ResponsibilityModelName } from '@okr/shared-models';
import {
  peopleSourceKey, peopleSourceOf, resolveGroupPeople, resolveRolePeople, roleIdsUnderParent,
  type GroupMembershipDoc, type GroupPersonDoc, type PublicGroup, type PublicPerson, type RoleDoc, type SectionDoc,
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

/** One role people section: its chosen role ids and, optionally, the parent whose active roles follow them. */
export interface RoleSource {
  ids: string[];
  parentKey?: string;
}

/**
 * The public holders of each role source (`peopleSourceKey` → resolveRolePeople): the chosen roles by key and
 * the roles of each parent (one `parentKey ==` query per parent — a single-field index, the tenant filter is
 * the resolver's), then the persons of their responsible / delegate avatars by key and the roles' own
 * portraits (avatar `<tenant>.responsibility.<key>`), in getAll batches. The parent's roles follow the chosen
 * ones (`roleIdsUnderParent`: active today, by name). Tenant, archive and privacy filters are the resolver's.
 */
export async function loadRolePeople(
  db: Firestore,
  sources: RoleSource[],
  siteTenants: string[],
  today = getTodayStr(DateFormat.StoreDate),
): Promise<Map<string, PublicPerson[]>> {
  const out = new Map<string, PublicPerson[]>();
  const tenants = siteTenants.filter(Boolean);
  const list = sources.filter((s) => s.ids.length > 0 || !!s.parentKey);
  if (list.length === 0 || tenants.length === 0) return out;

  const roles = await readByKeys<RoleDoc>(db, ResponsibilityCollection, list.flatMap((s) => s.ids));
  const parentKeys = [...new Set(list.map((s) => s.parentKey).filter((k): k is string => !!k && !k.includes('/')))];
  const byParent = new Map<string, Map<string, RoleDoc>>();
  await Promise.all(parentKeys.map(async (parentKey) => {
    const snap = await db.collection(ResponsibilityCollection).where('parentKey', '==', parentKey).get();
    const docs = new Map<string, RoleDoc>();
    for (const d of snap.docs) {
      const role = d.data() as RoleDoc;
      docs.set(d.id, role);
      roles.set(d.id, role);
    }
    byParent.set(parentKey, docs);
  }));

  const idsOf = (s: RoleSource): string[] => s.parentKey
    ? [...new Set([...s.ids, ...roleIdsUnderParent(byParent.get(s.parentKey) ?? new Map(), s.parentKey, tenants, today)])]
    : s.ids;
  const personKeys: string[] = [];
  for (const id of list.flatMap(idsOf)) {
    const role = roles.get(id);
    for (const avatar of [role?.responsibleAvatar, role?.delegateAvatar]) {
      if (avatar?.modelType === 'person' && typeof avatar.key === 'string') personKeys.push(avatar.key);
    }
  }
  const persons = await readByKeys<GroupPersonDoc>(db, PersonCollection, personKeys);
  const portraits = await loadRolePortraits(db, [...roles.keys()], tenants[0]);
  for (const s of list) {
    out.set(peopleSourceKey({ kind: 'responsibility', ids: s.ids, parentKey: s.parentKey }), resolveRolePeople(idsOf(s), roles, persons, tenants, portraits));
  }
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
  const roleSources = new Map<string, RoleSource>();
  for (const section of sections) {
    const source = peopleSourceOf(section);
    if (source?.kind === 'group') groupIds.add(source.groupId);
    if (source?.kind === 'responsibility') roleSources.set(peopleSourceKey(source), { ids: source.ids, parentKey: source.parentKey });
  }
  const [groups, roles] = await Promise.all([
    loadGroupPeople(db, [...groupIds], siteTenants, today),
    loadRolePeople(db, [...roleSources.values()], siteTenants, today),
  ]);
  const out = new Map<string, PublicPerson[]>(roles);
  for (const [groupId, persons] of groups) out.set(peopleSourceKey({ kind: 'group', groupId }), persons);
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

/** Raw snapshots by id, in getAll batches (missing documents come back with exists = false). */
async function readSnaps(db: Firestore, collection: string, ids: string[]): Promise<FirebaseFirestore.DocumentSnapshot[]> {
  const out: FirebaseFirestore.DocumentSnapshot[] = [];
  const unique = [...new Set(ids)];
  for (let i = 0; i < unique.length; i += GET_ALL_CHUNK) {
    out.push(...await db.getAll(...unique.slice(i, i + GET_ALL_CHUNK).map((k) => db.collection(collection).doc(k))));
  }
  return out;
}

/**
 * The cards of the groups whose pages are in the tree (TilesConfig source 'groups'): name, subtitle, colour and
 * the group's avatar as its logo — the tenant's own avatar first, then the shared one. Groups of another tenant
 * and archived groups are left out. Which of them is public is decided by the renderer (`groupTileItems`).
 */
export async function loadPublicGroups(db: Firestore, keys: string[], tenants: string[]): Promise<Map<string, PublicGroup>> {
  const out = new Map<string, PublicGroup>();
  if (keys.length === 0) return out;
  const tenantId = tenants[0] ?? '';
  const avatarIds = keys.flatMap((k) => [`${tenantId}.group.${k}`, `group.${k}`]);
  const avatars = new Map<string, string>();
  for (const snap of await readSnaps(db, AvatarCollection, avatarIds)) {
    const path = snap.data()?.['storagePath'];
    if (typeof path === 'string' && path) avatars.set(snap.id, path);
  }
  for (const snap of await readSnaps(db, GroupCollection, keys)) {
    const data = snap.data();
    if (!data || data['isArchived'] === true) continue;
    const owners = Array.isArray(data['tenants']) ? (data['tenants'] as string[]) : [];
    if (!owners.some((t) => tenants.includes(t))) continue;
    out.set(snap.id, {
      key: snap.id,
      name: typeof data['name'] === 'string' ? data['name'] : '',
      subTitle: typeof data['subTitle'] === 'string' ? data['subTitle'] : '',
      color: typeof data['color'] === 'string' ? data['color'] : '',
      image: avatars.get(`${tenantId}.group.${snap.id}`) ?? avatars.get(`group.${snap.id}`) ?? '',
    });
  }
  return out;
}

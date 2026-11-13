// People sections from a group (spec 1.153 §13): the Firestore side of resolveGroupPeople, shared by
// publishWebsite and publicApi's page route so both resolve a group section the same way.
import type { Firestore } from 'firebase-admin/firestore';
import { MembershipCollection, PersonCollection } from '@okr/shared-models';
import { resolveGroupPeople, type GroupMembershipDoc, type GroupPersonDoc, type PublicPerson, type SectionDoc } from '@okr/cms-website-render';
import { DateFormat, getTodayStr } from '@okr/shared-util-core';

const GET_ALL_CHUNK = 100;
/** Firestore's limit for array-contains-any. */
const MAX_TENANTS = 30;

/** The group key of a people section in group mode, else ''. */
export function groupIdOfSection(section: SectionDoc | undefined): string {
  if (section?.type !== 'people') return '';
  const props = section.properties ?? {};
  if (props['type'] !== 'group') return '';
  const groupId = props['groupId'];
  return typeof groupId === 'string' && groupId && !groupId.includes('/') ? groupId : '';
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

  const keys = [...new Set(perGroup.flatMap((g) => g.memberships.map((m) => m.memberKey)))]
    .filter((k): k is string => typeof k === 'string' && !!k && !k.includes('/'));
  const persons = new Map<string, GroupPersonDoc>();
  for (let i = 0; i < keys.length; i += GET_ALL_CHUNK) {
    const refs = keys.slice(i, i + GET_ALL_CHUNK).map((k) => db.collection(PersonCollection).doc(k));
    for (const snap of await db.getAll(...refs)) {
      const data = snap.data();
      if (data) persons.set(snap.id, data as GroupPersonDoc);
    }
  }

  for (const { groupId, memberships } of perGroup) {
    out.set(groupId, resolveGroupPeople(groupId, memberships, persons, tenants, today));
  }
  return out;
}

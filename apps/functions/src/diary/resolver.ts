// apps/functions/src/diary/resolver.ts
import type { Firestore } from 'firebase-admin/firestore';

import { AliasCollection, PersonCollection, TripCollection } from '@okr/shared-models';
import type { AliasModel, AvatarInfo, PersonModel, TripModel } from '@okr/shared-models';
import { toAliasSlug } from '@okr/system-alias-util';
import type { DiaryResolver } from '@okr/content-diary-util';

/** Alias space names, matching AliasModel.space for the two entity kinds the diary references. */
const PERSON_SPACE = 'person';

/** trips.type value for the travel trips seeded by scripts/seed-diary-trips.mjs (Task 3). */
const TRAVEL_TRIP_TYPE = 'travel';

type PersonName = Pick<PersonModel, 'firstName' | 'lastName'>;

/**
 * The pure resolver, built from three prefilled Maps — no Firestore access happens here, which
 * is what lets `DiaryResolver`'s methods stay synchronous (see diary-model-mapping.ts). This is
 * what the test exercises directly, without a Firestore mock.
 *
 * @param aliases alias document id (`<tenant>__<space>__<slug>`) -> `AliasModel.targetKey`
 *   (`'person.<okey>'`)
 * @param persons person `okey` -> the two name fields `toDiaryModel` needs for an `AvatarInfo`
 * @param trips trip file slug (e.g. '20200100beispiel') -> the trips document id
 *   (`<tenant>__travel__<slug>`), as written by scripts/seed-diary-trips.mjs
 */
export function buildResolver(
  tenantId: string,
  aliases: Map<string, string>,
  persons: Map<string, PersonName>,
  trips: Map<string, string>,
): DiaryResolver {
  return {
    resolvePerson(slug: string): AvatarInfo | undefined {
      const aliasId = `${tenantId}__${PERSON_SPACE}__${toAliasSlug(slug)}`;
      const targetKey = aliases.get(aliasId);
      const okey = targetKey?.split('.')[1];
      const person = okey ? persons.get(okey) : undefined;
      if (!okey || !person) {
        return undefined;
      }
      return {
        key: okey,
        name1: person.firstName,
        name2: person.lastName,
        modelType: 'person',
        type: '',
        subType: '',
        label: `${person.firstName} ${person.lastName}`.trim(),
      };
    },

    // Always undefined for now: no tenant has seeded location aliases yet (bka has zero
    // location records), so createDiaryResolver below never prefetches a locations Map. The
    // label stays free text (DiaryModel.customLocationLabel) — see toDiaryModel. Extend this
    // the same way resolvePerson works, with a prefetched locations Map, once a tenant seeds
    // location aliases.
    resolveLocation(_label: string): AvatarInfo | undefined {
      return undefined;
    },

    resolveTrip(slug: string): string {
      return trips.get(slug) ?? '';
    },
  };
}

/**
 * Thin async wrapper: fills the three Maps `buildResolver` needs with one query each, then
 * hands off to the pure function. See Step 1 of the task brief for why this is prefetched
 * rather than resolved per-call — `DiaryResolver`'s methods are synchronous by contract, so a
 * `getDoc` per person/location/trip mention cannot happen inside them.
 */
export async function createDiaryResolver(db: Firestore, tenantId: string): Promise<DiaryResolver> {
  const aliasSnap = await db
    .collection(AliasCollection)
    .where('tenants', 'array-contains', tenantId)
    .where('isArchived', '==', false)
    .where('space', '==', PERSON_SPACE)
    .get();

  const aliases = new Map<string, string>();
  const personOkeys = new Set<string>();
  for (const doc of aliasSnap.docs) {
    const data = doc.data() as AliasModel;
    aliases.set(doc.id, data.targetKey);
    const okey = data.targetKey.split('.')[1];
    if (okey) {
      personOkeys.add(okey);
    }
  }

  const persons = new Map<string, PersonName>();
  if (personOkeys.size > 0) {
    const refs = [...personOkeys].map((okey) => db.collection(PersonCollection).doc(okey));
    const snaps = await db.getAll(...refs);
    for (const snap of snaps) {
      if (!snap.exists) {
        continue;
      }
      const data = snap.data() as PersonModel;
      persons.set(snap.id, { firstName: data.firstName, lastName: data.lastName });
    }
  }

  // The 'type' filter is deliberately NOT in this query. tenants+isArchived+type would need a
  // composite index that does not exist (firestore.indexes.json only has tenants+isArchived+
  // startDate for `trips`, and that file is known-stale, so deploying an addition risks
  // dropping live indexes). tenants+isArchived alone is served by the equality-prefix rule off
  // the existing composite index, so filter 'type' in memory instead — free at 39 trips/tenant.
  // Do not "optimise" this back into a .where('type', ...) clause.
  const tripSnap = await db
    .collection(TripCollection)
    .where('tenants', 'array-contains', tenantId)
    .where('isArchived', '==', false)
    .get();

  const tripPrefix = `${tenantId}__${TRAVEL_TRIP_TYPE}__`;
  const trips = new Map<string, string>();
  for (const doc of tripSnap.docs) {
    const data = doc.data() as TripModel;
    if (data.type === TRAVEL_TRIP_TYPE && doc.id.startsWith(tripPrefix)) {
      trips.set(doc.id.slice(tripPrefix.length), doc.id);
    }
  }

  return buildResolver(tenantId, aliases, persons, trips);
}

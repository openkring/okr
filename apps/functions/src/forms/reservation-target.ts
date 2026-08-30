// apps/functions/src/forms/reservation-target.ts
//
// The `reservations.boathouse` form-mapping target
// (planning/specs/2026-08-29-generic-workflow-triggers-spec.md §6b, decision O1).
//
// `ReservationApplyModal` is converted to a form-builder definition, and this is where its
// submission becomes a `ReservationModel`. Like `prospects.default` it is NOT written by the
// generic collection path in `submitForm`: a reservation carries typed avatars (reserver,
// resource) and a built search index, neither of which a flat value bag produces.
//
// What the conversion buys beyond deleting a modal: the fields become tenant-editable in the
// form builder, the submission inherits the whole `submitForm` gateway (rate limit, honeypot,
// timing check, optional captcha, file encryption), and the reservation is created
// SERVER-side — where the old client-side `isReservation()` check cannot be bypassed.

import { HttpsError } from 'firebase-functions/v2/https';
import { Firestore } from 'firebase-admin/firestore';

import { AvatarInfo, ReservationModel } from '@okr/shared-models';
import { DateFormat, getTodayStr } from '@okr/shared-util-core';
import { getReservationIndex } from '@okr/relationship-reservation-util';

const APP_CONFIG_COLLECTION = 'app-config';
const RESOURCE_COLLECTION = 'resources';
const USERS_COLLECTION = 'users';
const PERSON_COLLECTION = 'persons';

export interface ReservationBuildContext {
  tenantId: string;
  reserver: AvatarInfo;
  resource: AvatarInfo;
  /** rendered submission time, for the audit line appended to the description */
  stamp: string;
}

const str = (v: unknown): string => (v === undefined || v === null ? '' : String(v)).trim();
const bool = (v: unknown): boolean => v === true || v === 'true';
const num = (v: unknown, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/**
 * The pure server-side twin of `convertApplyToReservation`
 * (libs/relationship/reservation/util/src/lib/reservation.util.ts).
 *
 * It also carries the two CROSS-FIELD checks the form builder's per-field validators cannot
 * express. Per §6b those belong here, in the mapping's write, and not back in a modal: a
 * modal-side check is a client-side check, and this path exists precisely to stop being one.
 */
export function buildReservationRecord(
  values: Record<string, unknown>,
  ctx: ReservationBuildContext,
): ReservationModel {
  const name = str(values['name']);
  if (!name) throw new HttpsError('invalid-argument', 'name is required');

  // The confirmation checkbox arrives as `false` when it is left unticked, which PASSES the
  // required-field check in submitForm (the key is present). So the refusal has to live with
  // the write — the same reason createProspect refuses a lead without consent.
  if (!bool(values['isConfirmed'])) {
    throw new HttpsError('invalid-argument', 'isConfirmed must be accepted');
  }

  const startDate = str(values['startDate']);
  // an empty end date means a single-day booking, which is what the form's default expresses
  const endDate = str(values['endDate']) || startDate;
  // StoreDate is 'yyyymmdd', so a lexicographic comparison IS the chronological one
  if (startDate && endDate < startDate) {
    throw new HttpsError('invalid-argument', `endDate ${endDate} precedes startDate ${startDate}`);
  }

  const rm = new ReservationModel(ctx.tenantId);
  rm.name = name;
  rm.reserver = ctx.reserver;
  rm.resource = ctx.resource;
  rm.startDate = startDate;
  rm.startTime = str(values['startTime']);
  rm.fullDay = bool(values['fullDay']);
  rm.durationMinutes = num(values['durationMinutes'], 60);
  rm.endDate = endDate;
  rm.participants = str(values['participants']);
  rm.area = str(values['area']);
  rm.reason = str(values['reason']) || rm.reason;
  // The three fields a ReservationModel has no home for are appended to the public notes, as
  // the modal did. The audit line names the reserver in full — the original repeated `name1`
  // twice, which read as "Anna Anna"; that was a typo, not a convention.
  rm.description = [
    str(values['description']),
    `-------------${ctx.reserver.name1} ${ctx.reserver.name2}/${ctx.stamp}`,
    `             Zelt:      ${bool(values['usesTent'])}`,
    `             Firma:     ${str(values['company'])}`,
    `             Bestätigt: ${bool(values['isConfirmed'])}`,
  ].join('\n');
  rm.index = getReservationIndex(rm);
  return rm;
}

/**
 * Resolve the two avatars a reservation needs, then write it.
 *
 * Authentication is REQUIRED for this mapping even though `submitForm` itself is public: a
 * reservation without a person cannot be linked to anybody, cancelled by its reserver, or
 * shown in "my reservations". A public boathouse enquiry is a different form with a different
 * mapping, not this one.
 */
export async function createBoathouseReservation(
  db: Firestore,
  args: { tenantId: string; uid: string | undefined; values: Record<string, unknown>; defaults?: Record<string, unknown> },
): Promise<string> {
  if (!args.uid) {
    throw new HttpsError('unauthenticated', 'a reservation needs a signed-in reserver');
  }

  const userSnap = await db.collection(USERS_COLLECTION).doc(args.uid).get();
  const user = userSnap.data();
  if (!user || !((user['tenants'] as string[] | undefined) ?? []).includes(args.tenantId)) {
    throw new HttpsError('permission-denied', 'not a member of this tenant');
  }
  const personKey = str(user['personKey']);
  if (!personKey) throw new HttpsError('failed-precondition', 'the account has no person');

  const personSnap = await db.collection(PERSON_COLLECTION).doc(personKey).get();
  const person = personSnap.data();
  if (!person) throw new HttpsError('failed-precondition', 'the reserver person was not found');

  const reserver: AvatarInfo = {
    key: personKey,
    name1: str(person['firstName']),
    name2: str(person['lastName']),
    modelType: 'person', type: '', subType: '', label: '',
  };

  // The reservable resource is the tenant's configured default — the same document the client
  // used to read through `AppStore.defaultResource`, so the conversion changes no data.
  const configSnap = await db.collection(APP_CONFIG_COLLECTION).doc(args.tenantId).get();
  const resourceKey = str(configSnap.data()?.['defaultResourceId']);
  if (!resourceKey) {
    throw new HttpsError('failed-precondition', `tenant '${args.tenantId}' has no defaultResourceId`);
  }
  const resourceSnap = await db.collection(RESOURCE_COLLECTION).doc(resourceKey).get();
  const resourceDoc = resourceSnap.data();
  if (!resourceDoc) throw new HttpsError('failed-precondition', 'the default resource was not found');

  const resource: AvatarInfo = {
    key: resourceKey,
    name1: str(resourceDoc['name']),
    name2: str(resourceDoc['name']),
    modelType: 'resource',
    type: str(resourceDoc['type']),
    subType: str(resourceDoc['subType']),
    label: '',
  };

  const record = buildReservationRecord(args.values, {
    tenantId: args.tenantId,
    reserver,
    resource,
    stamp: getTodayStr(DateFormat.ViewDateTime),
  });

  // The mapping's defaults win, exactly as on the generic collection path.
  const doc: Record<string, unknown> = { ...record, ...(args.defaults ?? {}) };
  // okey is the document ID and is stripped before every write (the model contract)
  delete doc['okey'];
  const ref = await db.collection('reservations').add(doc);
  // `reservation.created` fires from the collection's onDocumentCreated emitter, so the task
  // for the responsible person is a RULE, not code here.
  return ref.id;
}

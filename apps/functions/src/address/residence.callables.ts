/**
 * Spec 1.164 §6.1–§6.5: the only write path for moves. The app calls these; each one checks App
 * Check, auth and the recorder permission (owner, or privileged / admin / memberAdmin of a tenant
 * of the parent — read from users/{uid}, never from claims), writes every row change in ONE batch
 * and then sends the notices (§6.4), which never fail the call. Writes to rows that were read carry
 * their read `updateTime` as `lastUpdateTime` (a concurrent change → `aborted`); a first residence
 * gets a deterministic id and is `create`d (a double submit → `already-exists`), or overwrites an
 * archived (cancelled) row at that id under its read time.
 *
 * Every postal write sets `locationKey` and the snapshot together, so `onAddressChange` does not
 * re-heal it (it relinks only a snapshot change under an unchanged `locationKey`).
 */
import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { FieldValue, Firestore, getFirestore, Timestamp, WriteBatch } from 'firebase-admin/firestore';

import { AddressCollection, AddressModel, UserCollection } from '@okr/shared-models';
import { getFullName, isPostalResidence, residenceStatus, zurichStoreDate } from '@okr/shared-util-core';
import {
  AddressSnapshot, buildRegisterLocation, checkAppCheckToken, checkAuthentication, findOrCreateRegisterLocation,
  ManualAddressInput, parseParentKey, RegisterAddressInput, searchSwissAddresses, snapshotFromLocation, SwissAddressHit,
} from '@okr/shared-util-functions';

import { MoveNotice, MoveNoticeKind, sendMoveNotices } from './residence-notices';
import {
  CallerFacts, commitError, firstResidenceWrite, isOwnerOf, matchServerHit, mayRecordPostal, parseTarget, ParsedTarget, newResidenceId, planCancel, planMove, postalIndex,
  recorderTenantId, requireAddressUsage, requireAddressValue2, requireDocKey, requireParentKey, requireQuery, requireStoreDate, snapshotText, strayFields,
} from './residence.logic';

const REGION = 'europe-west6';

export interface PostalTarget {
  egaid?: string;
  hit?: SwissAddressHit;
  manual?: ManualAddressInput;
}

export interface SearchSwissAddressRequest { query: string }
export interface RecordPostalMoveRequest {
  parentKey: string;
  /** the residence moved away from; required when the parent has an open (current or future) postal row */
  fromResidenceKey?: string;
  /** usage of a first residence (no open row); default 'home'. Otherwise the usage of fromResidenceKey */
  addressUsage?: string;
  target: PostalTarget;
  addressValue2: string;
  validFrom: string;
}
export interface CorrectPostalAddressRequest { residenceKey: string; target: PostalTarget; addressValue2: string }
export interface CancelPostalMoveRequest { residenceKey: string }

const strArray = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

// ---------------------------------------------------------------------------------------------
// loading
// ---------------------------------------------------------------------------------------------

async function loadCaller(db: Firestore, uid: string): Promise<CallerFacts> {
  const user = (await db.collection(UserCollection).doc(uid).get()).data();
  const roles = user?.['roles'];
  return {
    personKey: str(user?.['personKey']),
    tenants: strArray(user?.['tenants']),
    roles: roles && typeof roles === 'object' ? (roles as Record<string, unknown>) : {},
  };
}

interface Parent { name: string; tenants: string[] }

async function loadParent(db: Firestore, parentKey: string): Promise<Parent> {
  const parsed = parseParentKey(parentKey);
  if (!parsed) throw new HttpsError('invalid-argument', 'parentKey must be person.<key> or org.<key>');
  const snap = await db.collection(parsed.parentCollection).doc(parsed.parentId).get();
  const data = snap.data();
  if (!snap.exists || !data) throw new HttpsError('not-found', `${parentKey} not found`);
  const name = parsed.parentType === 'person' ? getFullName(str(data['firstName']), str(data['lastName'])) : str(data['name']);
  return { name, tenants: strArray(data['tenants']) };
}

/** Loads caller and parent and applies the permission gate. */
async function authorize(db: Firestore, uid: string, parentKey: string, fn: string): Promise<{ caller: CallerFacts; parent: Parent }> {
  const [caller, parent] = await Promise.all([loadCaller(db, uid), loadParent(db, parentKey)]);
  if (!mayRecordPostal(caller, parentKey, parent.tenants)) {
    logger.warn(`${fn}: user ${uid} may not record postal addresses of ${parentKey}`);
    throw new HttpsError('permission-denied', 'Diese Adresse darfst du nicht ändern.');
  }
  return { caller, parent };
}

/**
 * The parent's active postal rows, with the update time each was read at: every write to a row read
 * here carries it as `lastUpdateTime`, so a concurrent change makes the whole batch fail.
 */
async function loadPostalRows(db: Firestore, parentKey: string): Promise<{ rows: AddressModel[]; readAt: Map<string, Timestamp> }> {
  const snap = await db.collection(AddressCollection).where('parentKey', '==', parentKey).get();
  const rows: AddressModel[] = [];
  const readAt = new Map<string, Timestamp>();
  for (const d of snap.docs) {
    const row = { ...d.data(), okey: d.id } as AddressModel;
    if (!isPostalResidence(row)) continue;
    rows.push(row);
    readAt.set(d.id, d.updateTime);
  }
  return { rows, readAt };
}

/** Loads a residence row by key; it must be an active postal row of a person or org. */
async function loadResidence(db: Firestore, residenceKey: string): Promise<{ row: AddressModel; readAt: Timestamp }> {
  const snap = await db.collection(AddressCollection).doc(residenceKey).get();
  const data = snap.data();
  if (!snap.exists || !data || !snap.updateTime) throw new HttpsError('not-found', `residence ${residenceKey} not found`);
  const row = { ...data, okey: snap.id } as AddressModel;
  if (!isPostalResidence(row)) throw new HttpsError('failed-precondition', `address ${residenceKey} is not an active postal address`);
  requireParentKey(row.parentKey);
  return { row, readAt: snap.updateTime };
}

/** `lastUpdateTime` of a row read by loadPostalRows; a row not read there is a programming error. */
function readTime(readAt: Map<string, Timestamp>, okey: string): { lastUpdateTime: Timestamp } {
  const t = readAt.get(okey);
  if (!t) throw new HttpsError('internal', `residence ${okey} was not read before writing`);
  return { lastUpdateTime: t };
}

async function commit(batch: WriteBatch): Promise<void> {
  try {
    await batch.commit();
  } catch (err) {
    throw commitError(err);
  }
}

interface ResolvedTarget { locationKey: string; snapshot: AddressSnapshot; isValidated: boolean }

/**
 * Finds or creates the register location. A swisstopo choice is re-searched server-side with its
 * label and only the server's hit with the same EGAID is used: a client cannot plant a register doc
 * with a real EGAID and invented text or coordinates.
 */
async function resolveTarget(db: Firestore, target: ParsedTarget): Promise<ResolvedTarget> {
  let input: RegisterAddressInput;
  if (target.kind === 'hit') {
    const hit = matchServerHit(await searchSwissAddresses(target.label), target.egaid);
    if (!hit) throw new HttpsError('failed-precondition', 'Adresse nicht gefunden');
    input = hit;
  } else {
    input = target.manual;
  }
  const locationKey = await findOrCreateRegisterLocation(db, input);
  return { locationKey, snapshot: snapshotFromLocation(buildRegisterLocation(input)), isValidated: target.kind === 'hit' };
}

/** The fields every relink writes together: link, frozen snapshot, c/o line, validation flag, index. */
function linkPatch(parentKey: string, resolved: ResolvedTarget, addressValue2: string): Record<string, unknown> {
  return {
    locationKey: resolved.locationKey,
    ...resolved.snapshot,
    addressValue2,
    isValidated: resolved.isValidated,
    index: postalIndex({ ...resolved.snapshot, parentKey }),
  };
}

function notice(kind: MoveNoticeKind, parentKey: string, parent: Parent, caller: CallerFacts, texts: { oldText: string; newText: string; validFrom: string; noticeKey: string }): MoveNotice {
  return {
    kind,
    parentKey,
    parentName: parent.name,
    parentTenants: parent.tenants,
    ...texts,
    recorder: { personKey: caller.personKey, isOwner: isOwnerOf(caller, parentKey), tenantId: recorderTenantId(caller.tenants, parent.tenants) },
  };
}

function guard(request: CallableRequest<unknown>, fn: string): string {
  checkAppCheckToken(request as never, fn);
  checkAuthentication(request as never, fn);
  return request.auth?.uid ?? '';
}

// ---------------------------------------------------------------------------------------------
// callables
// ---------------------------------------------------------------------------------------------

/** swisstopo address search for the move modal (§6.2). Signed-in users only; only the query leaves the app. */
export const searchSwissAddress = onCall<SearchSwissAddressRequest, Promise<{ hits: SwissAddressHit[] }>>(
  { region: REGION, enforceAppCheck: true },
  async (request) => {
    guard(request, 'searchSwissAddress');
    const query = requireQuery(request.data?.query);
    return { hits: await searchSwissAddresses(query) };
  },
);

/** «Ich ziehe um» / «Umzug erfassen»: a new residence from `validFrom`, the open one ends the day before. */
export const recordPostalMove = onCall<RecordPostalMoveRequest, Promise<{ residenceKey: string }>>(
  { region: REGION, enforceAppCheck: true },
  async (request) => {
    const fn = 'recordPostalMove';
    const uid = guard(request, fn);
    const parentKey = requireParentKey(request.data?.parentKey);
    const target = parseTarget(request.data?.target);
    const addressValue2 = requireAddressValue2(request.data?.addressValue2);
    const validFrom = requireStoreDate(request.data?.validFrom, 'validFrom');
    const fromKey = request.data?.fromResidenceKey === undefined || request.data?.fromResidenceKey === '' ? '' : requireDocKey(request.data.fromResidenceKey, 'fromResidenceKey');
    const addressUsage = requireAddressUsage(request.data?.addressUsage);

    const db = getFirestore();
    const { caller, parent } = await authorize(db, uid, parentKey, fn);
    const { rows, readAt } = await loadPostalRows(db, parentKey);
    if (fromKey && !rows.some((r) => r.okey === fromKey)) {
      // a row of another parent: the caller was authorized for this parent only
      const other = (await db.collection(AddressCollection).doc(fromKey).get()).data();
      if (other && other['parentKey'] !== parentKey) throw new HttpsError('permission-denied', 'Diese Adresse darfst du nicht ändern.');
    }
    const plan = planMove(rows, validFrom, zurichStoreDate(new Date()), fromKey, addressUsage);   // refuses before a location is created
    const resolved = await resolveTarget(db, target);

    const col = db.collection(AddressCollection);
    const closed = plan.from ? rows.find((r) => r.okey === plan.from) : undefined;
    const chainRow = closed ?? rows.find((r) => r.okey === fromKey);
    const hasPredecessor = plan.close.length > 0;
    // without a predecessor nothing carries a precondition: a deterministic id makes a double submit collide
    const ref = hasPredecessor ? col.doc() : col.doc(newResidenceId(parentKey, validFrom, resolved.locationKey));
    const { okey, ...base } = { ...new AddressModel(parent.tenants[0] ?? '') };   // okey is the document id, never a field
    void okey;
    const doc: Record<string, unknown> = {
      ...base,
      addressChannel: 'postal',
      addressUsage: plan.addressUsage,
      addressUsageLabel: chainRow ? (chainRow.addressUsageLabel ?? '') : '',
      ...linkPatch(parentKey, resolved, addressValue2),
      validFrom,
      validTo: '',
      isFavorite: plan.newIsFavorite,
      tenants: [...parent.tenants],
      parentKey,
    };

    const batch = db.batch();
    const closing = new Set(plan.close.map((c) => c.okey));
    for (const c of plan.close) {
      const patch: Record<string, unknown> = { validTo: c.validTo };
      if (plan.demote.includes(c.okey)) patch['isFavorite'] = false;
      batch.update(col.doc(c.okey), patch, readTime(readAt, c.okey));
    }
    for (const okey of plan.demote.filter((k) => !closing.has(k))) batch.update(col.doc(okey), { isFavorite: false }, readTime(readAt, okey));
    const data = Object.fromEntries(Object.entries(doc).filter(([, v]) => v !== undefined));
    if (hasPredecessor) {
      batch.create(ref, data);
    } else {
      // a first residence: its deterministic id may hold a cancelled (archived) move, which is reused
      const existing = await ref.get();
      const write = firstResidenceWrite(existing.data());
      if (write === 'exists') throw new HttpsError('already-exists', 'Dieser Umzug ist schon erfasst.');
      if (write === 'create' || !existing.updateTime) {
        batch.create(ref, data);
      } else {
        // set() takes no precondition: a full update plus deleting stray fields is the same overwrite
        const patch: Record<string, unknown> = { ...data };
        for (const k of strayFields(existing.data() ?? {}, data)) patch[k] = FieldValue.delete();
        batch.update(ref, patch, { lastUpdateTime: existing.updateTime });
      }
    }
    await commit(batch);
    logger.info(`${fn}: ${parentKey} moves to ${resolved.locationKey} from ${validFrom}`, { residenceKey: ref.id, closed: plan.close.map((c) => c.okey).join(',') });

    await sendMoveNotices(db, notice('move', parentKey, parent, caller, {
      oldText: closed ? snapshotText(closed) : '',
      newText: snapshotText(resolved.snapshot),
      validFrom,
      noticeKey: resolved.locationKey,
    }));
    return { residenceKey: ref.id };
  },
);

/** «Adresse korrigieren» / «Umzug bearbeiten» (address): relink and rewrite the snapshot, dates unchanged. Never a move. */
export const correctPostalAddress = onCall<CorrectPostalAddressRequest, Promise<{ locationKey: string }>>(
  { region: REGION, enforceAppCheck: true },
  async (request) => {
    const fn = 'correctPostalAddress';
    const uid = guard(request, fn);
    const residenceKey = requireDocKey(request.data?.residenceKey, 'residenceKey');
    const target = parseTarget(request.data?.target);
    const addressValue2 = requireAddressValue2(request.data?.addressValue2);

    const db = getFirestore();
    const { row, readAt } = await loadResidence(db, residenceKey);
    const { caller, parent } = await authorize(db, uid, row.parentKey, fn);
    const resolved = await resolveTarget(db, target);

    const batch = db.batch();
    batch.update(db.collection(AddressCollection).doc(residenceKey), linkPatch(row.parentKey, resolved, addressValue2), { lastUpdateTime: readAt });
    await commit(batch);
    logger.info(`${fn}: residence ${residenceKey} relinked to ${resolved.locationKey}`);

    await sendMoveNotices(db, notice('correction', row.parentKey, parent, caller, {
      oldText: snapshotText(row),
      newText: snapshotText(resolved.snapshot),
      validFrom: row.validFrom ?? '',
      noticeKey: `${residenceKey}|${resolved.locationKey}`,
    }));
    return { locationKey: resolved.locationKey };
  },
);

/** «Umzug absagen»: archives an announced (future) residence and reopens the row it would have closed. */
export const cancelPostalMove = onCall<CancelPostalMoveRequest, Promise<void>>(
  { region: REGION, enforceAppCheck: true },
  async (request) => {
    const fn = 'cancelPostalMove';
    const uid = guard(request, fn);
    const residenceKey = requireDocKey(request.data?.residenceKey, 'residenceKey');

    const db = getFirestore();
    const { row } = await loadResidence(db, residenceKey);
    const { caller, parent } = await authorize(db, uid, row.parentKey, fn);
    if (residenceStatus(row, zurichStoreDate(new Date())) !== 'future') {
      throw new HttpsError('failed-precondition', 'only an announced move (a future address) can be cancelled');
    }
    const { rows, readAt } = await loadPostalRows(db, row.parentKey);
    const { reopen } = planCancel(rows, residenceKey);

    const col = db.collection(AddressCollection);
    const batch = db.batch();
    batch.update(col.doc(residenceKey), { isArchived: true, isFavorite: false }, readTime(readAt, residenceKey));
    if (reopen) batch.update(col.doc(reopen.okey), { validTo: reopen.validTo }, readTime(readAt, reopen.okey));
    await commit(batch);
    logger.info(`${fn}: residence ${residenceKey} cancelled`, { reopened: reopen?.okey ?? '', validTo: reopen?.validTo ?? '' });

    const reopened = reopen ? rows.find((r) => r.okey === reopen.okey) : undefined;
    await sendMoveNotices(db, notice('cancel', row.parentKey, parent, caller, {
      oldText: snapshotText(row),
      newText: reopened ? snapshotText(reopened) : '',
      validFrom: row.validFrom ?? '',
      noticeKey: residenceKey,
    }));
  },
);

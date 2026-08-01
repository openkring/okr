import { createHash, randomUUID } from 'node:crypto';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import type { DocumentSnapshot, Firestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { logger } from 'firebase-functions/v2';

import {
  AddressCollection, AvatarCollection, ErasureLogCollection, PersonCollection, UserCollection,
} from '@okr/shared-models';
import { writeAddressDirectory } from '@okr/shared-util-functions';
import { DateFormat, getTodayStr } from '@okr/shared-util-core';

import { resolveDocs } from './subject-data-map';
import type { ErasurePreview } from './erasure-preview';
import type { SubjectCtx, SubjectDataEntry } from './types';

/**
 * The erasure executor (5B, task C2).
 *
 * Two decisions shape everything in this file:
 *
 * **D-P5-2 — a tenant exit is a detach, never a global delete.** The person, the user
 * account, the vault addresses and the avatar are shared across tenancies. This run
 * strips `ctx.tenantId` from them and hard-deletes them if and only if the person's
 * `tenants[]` empties as a result — re-read at that moment, never taken from the
 * preview. Nothing returned, logged or notified may state or imply that another tenancy
 * exists, which is why `ErasureResult.personDeleted` is internal and the callable's
 * response deliberately reads the same either way.
 *
 * **D-L2 — the detach must reach the address documents themselves.** Raw vault access is
 * granted against the *address* document's own `tenants[]`
 * (`canReadVault` → `belongsToTenant(resource.data)`), not the parent's. Detaching only
 * the person leaves every address still stamped with the departing tenant raw-readable
 * by that tenant's privileged and memberAdmin users — ssn, dob and iban included —
 * indefinitely after the member has left. Skipping step 4 does not merely leave a gap;
 * it makes the erasure *create* the exposure.
 *
 * Every side effect goes through `ErasureOps` so the order and the decisions are
 * unit-tested without an emulator; `firestoreErasureOps()` is the production wiring.
 */

/** Salt for the pseudonym. A secret (Secret Manager) because the person-key space is
 * small enough to enumerate: an unsalted hash reverses to a person in seconds. */
function configuredSalt(): string {
  return process.env['ERASURE_SALT'] ?? '';
}

/**
 * A stable, human-readable German pseudonym for one person **in one tenant**.
 *
 * Salted with the tenant id as well as the secret, so the same person erased in two
 * tenants yields two unrelated pseudonyms — nothing can be joined back across tenants.
 * Treat the secret as write-once: rotating it changes future pseudonyms while leaving
 * past ones in place, which is harmless (nothing joins on the pseudonym) but makes the
 * register inconsistent to read.
 */
export function pseudonymFor(tenantId: string, personKey: string, salt = configuredSalt()): string {
  if (salt === '') {
    throw new Error('ERASURE_SALT is not configured — refusing to write a brute-forceable pseudonym.');
  }
  const hash = createHash('sha256').update(`${tenantId}:${personKey}:${salt}`).digest('hex');
  return `Gelöschtes Mitglied #${hash.slice(0, 8)}`;
}

/**
 * Which of a row's `anonymizeFields` carries the pseudonym: exactly one per identity,
 * the field a UI renders as the display name. Everything else in the list — keys,
 * foreign ids, birth years, zip codes, IBANs, first names, nicknames — is CLEARED.
 *
 * Pseudonymizing them instead would be worse than useless: `memberBirthYear` next to a
 * category is a quasi-identifier in a club this size, and `memberBexioId` is a live join
 * key into a system where the name still lives. And filling every name field with the
 * same pseudonym renders as "Gelöschtes Mitglied #ab12 Gelöschtes Mitglied #ab12".
 */
function isDisplayNameField(path: string): boolean {
  const last = path.split('.').pop()?.toLowerCase() ?? '';
  return last === 'name' || last === 'name2' || last === 'lastname' || last === 'authorname';
}

/** Whether an array element — an `AvatarInfo` or a wrapper like `{ person: AvatarInfo }` —
 * identifies the subject. Mirrors the `matches` predicates in the subject-data map. */
function elementIdentifies(element: unknown, personKey: string): boolean {
  if (!personKey || element === null || typeof element !== 'object') return false;
  const el = element as Record<string, unknown>;
  if (el['key'] === personKey) return true;
  const person = el['person'] as Record<string, unknown> | undefined;
  return person?.['key'] === personKey;
}

/**
 * The Firestore update patch that anonymizes ONE document for ONE subject.
 *
 * Honours contract step 5 of `SubjectDataEntry`: a nested `AvatarInfo` group is only
 * overwritten when its `.key` is the subject's (a task carries an author *and* an
 * assignee), and an array field loses only the matching element (a group keeps its other
 * admins). Dotted keys are Firestore field paths, so a patch never rewrites a whole map.
 *
 * Returns `{ anonymizedAt }` alone when the subject appears in none of the row's fields;
 * the executor treats that as "nothing to do" and does not write it.
 */
export function anonymizePatch(
  entry: SubjectDataEntry,
  doc: DocumentSnapshot,
  ctx: SubjectCtx,
  pseudonym: string,
  now: string,
): Record<string, unknown> {
  const patch: Record<string, unknown> = { anonymizedAt: now };

  for (const field of entry.anonymizeFields ?? []) {
    const value = doc.get(field);

    if (Array.isArray(value)) {
      const kept = value.filter((el) => !elementIdentifies(el, ctx.personKey));
      if (kept.length !== value.length) patch[field] = kept;
      continue;
    }

    // A dotted path is a nested group (`counterparty.key`, `author.name2`). Touch it only
    // when the group is the subject's — otherwise a second party on the same document
    // gets anonymized along with them.
    const segments = field.split('.');
    if (segments.length > 1) {
      const groupKey = [...segments.slice(0, -1), 'key'].join('.');
      if (doc.get(groupKey) !== ctx.personKey) continue;
    }

    // Flat fields are safe to write unconditionally: the row's query already established
    // that this document is the subject's, and a legacy document missing the field still
    // ends up in its erased state rather than keeping a stale one.
    patch[field] = isDisplayNameField(field) ? pseudonym : '';
  }

  return patch;
}

export interface DocPatch {
  readonly doc: DocumentSnapshot;
  readonly patch: Record<string, unknown>;
}

export interface DetachResult {
  readonly detached: number;
  readonly deleted: number;
}

/** One entry in `erasure-log`: evidence that an erasure ran, with **no personal data** —
 * no name, no e-mail, no personKey, no uid, and nothing that would tell a reading admin
 * whether the person still exists in another tenant (D-P5-2). */
export interface ErasureLogEntry {
  readonly okey: string;
  readonly tenantId: string;
  readonly tenants: string[];       // for belongsToTenant() in firestore.rules
  readonly executedAt: string;
  readonly pseudonym: string;
  readonly counts: Record<string, number>;
  readonly trigger: 'self' | 'partial' | 'lifecycle' | 'admin';
}

/** Every side effect the executor performs. Injected so the ordering and the D-P5-2 /
 * D-L2 decisions are testable; `firestoreErasureOps()` is the production implementation. */
export interface ErasureOps {
  /** MUST go through `resolveDocs` — `find` alone returns other members' documents. */
  resolve(entry: SubjectDataEntry, ctx: SubjectCtx): Promise<DocumentSnapshot[]>;
  deleteAll(docs: readonly DocumentSnapshot[]): Promise<number>;
  patchAll(patches: readonly DocPatch[]): Promise<number>;
  /** arrayRemove(tenantId) on each doc; hard-delete the ones whose `tenants[]` empties. */
  detachTenant(docs: readonly DocumentSnapshot[], tenantId: string): Promise<DetachResult>;
  loadAddresses(parentKey: string): Promise<DocumentSnapshot[]>;
  loadAvatar(parentKey: string): Promise<DocumentSnapshot | undefined>;
  /** Delete the avatar's Storage object — §10: the image is a copy of person data and
   *  `storage.rules` does not hide it, so it must be deleted, not merely dereferenced. */
  deleteAvatarFile(storagePath: string): Promise<void>;
  loadPerson(personKey: string): Promise<DocumentSnapshot | undefined>;
  loadUser(uid: string): Promise<DocumentSnapshot | undefined>;
  /** Fresh read of `person.tenants` AFTER the detach, inside a transaction. */
  personTenantsAfterDetach(personKey: string): Promise<string[]>;
  deleteAuthUser(uid: string): Promise<void>;
  rebuildAddressDirectory(parentKey: string): Promise<void>;
  writeErasureLog(entry: ErasureLogEntry): Promise<void>;
}

/** Internal result. **Not the callable's response shape** — `personDeleted` and
 * `authUserDeleted` would disclose whether another tenancy exists (D-P5-2). */
export interface ErasureResult {
  readonly executedAt: string;
  readonly pseudonym: string;
  readonly counts: Record<string, number>;
  readonly addressesDetached: number;
  readonly addressesDeleted: number;
  readonly personDeleted: boolean;
  readonly authUserDeleted: boolean;
}

export interface ErasureOptions {
  readonly salt?: string;
  readonly now?: string;
  readonly trigger?: ErasureLogEntry['trigger'];
}

function tenantsOf(doc: DocumentSnapshot): string[] {
  return (doc.get('tenants') as string[] | undefined) ?? [];
}

/** Delete the image behind an avatar document that has just been deleted (§10, D-L2).
 *  A document with no `storagePath` has no file to reap — that is not an error. */
async function deleteAvatarObject(avatar: DocumentSnapshot, ops: ErasureOps): Promise<void> {
  const storagePath = (avatar.get('storagePath') as string | undefined) ?? '';
  if (storagePath !== '') await ops.deleteAvatarFile(storagePath);
}

/**
 * Runs the erasure in the pinned order: deletes → anonymizations → tenant detach of the
 * shared documents → D-L2 address/avatar detach → the conditional hard delete → the
 * projection rebuild → the log. Reordering any of it breaks a property:
 *
 * - deletes before anonymizations, so a document that is both is gone before it is patched;
 * - the detach after both, so the tenant filter in `resolveDocs` still matches while the
 *   rows are being read;
 * - `rebuildAddressDirectory` LAST, because a *delete* of the last address may not fire
 *   the parent trigger and a stale projection would outlive the erasure;
 * - the log after everything, so its counts describe what actually happened.
 */
export async function executeErasure(
  ctx: SubjectCtx,
  preview: ErasurePreview,
  entries: readonly SubjectDataEntry[],
  ops: ErasureOps,
  options: ErasureOptions = {},
): Promise<ErasureResult> {
  if (preview.blockers.length > 0) {
    throw new Error('executeErasure: refusing to run — the preview reports open blockers.');
  }
  const executedAt = options.now ?? getTodayStr(DateFormat.StoreDateTime);
  const pseudonym = pseudonymFor(ctx.tenantId, ctx.personKey, options.salt);
  const counts: Record<string, number> = {};

  // 1 — deletes. `onTenantExit: 'detach'` rows (persons, users, addresses, avatars) are
  //     excluded here even though their `onErasure` is 'delete': they are shared across
  //     tenancies and are handled by steps 3–5.
  for (const entry of entries.filter((e) => e.onErasure === 'delete' && e.onTenantExit !== 'detach')) {
    const docs = await ops.resolve(entry, ctx);
    if (docs.length === 0) continue;
    counts[entry.collection] = await ops.deleteAll(docs);
  }

  // 2 — anonymizations (patch only; amounts, dates and document references survive).
  for (const entry of entries.filter((e) => e.onErasure === 'anonymize')) {
    const docs = await ops.resolve(entry, ctx);
    const patches = docs
      .map((doc) => ({ doc, patch: anonymizePatch(entry, doc, ctx, pseudonym, executedAt) }))
      // a patch of `anonymizedAt` alone means the subject was in none of the row's
      // fields — stamping it would claim a change that did not happen
      .filter((p) => Object.keys(p.patch).length > 1);
    if (patches.length === 0) continue;
    counts[entry.collection] = await ops.patchAll(patches);
  }

  // 3 — tenant detach of the shared parent documents.
  const shared = [await ops.loadPerson(ctx.personKey), await ops.loadUser(ctx.uid)]
    .filter((d): d is DocumentSnapshot => !!d && tenantsOf(d).includes(ctx.tenantId));
  if (shared.length > 0) await ops.detachTenant(shared, ctx.tenantId);

  // 4 — D-L2: the same treatment for every address of the parent and for the avatar.
  const stamped = (await ops.loadAddresses(ctx.parentKey)).filter((a) => tenantsOf(a).includes(ctx.tenantId));
  const addressResult = stamped.length > 0
    ? await ops.detachTenant(stamped, ctx.tenantId)
    : { detached: 0, deleted: 0 };
  const avatar = await ops.loadAvatar(ctx.parentKey);
  if (avatar && tenantsOf(avatar).includes(ctx.tenantId)) {
    const avatarResult = await ops.detachTenant([avatar], ctx.tenantId);
    // The Storage object dies with the document, never before it: while the avatar is
    // still stamped with another tenant, that tenant is entitled to display it, and a
    // deleted file would leave every remaining tenancy with a broken image.
    if (avatarResult.deleted > 0) await deleteAvatarObject(avatar, ops);
  }

  // 5 — the hard delete, only when this was the last tenancy. Re-read, never inferred
  //     from the preview: a join in another tenant between preview and execution would
  //     otherwise cost the person their record.
  const remaining = await ops.personTenantsAfterDetach(ctx.personKey);
  const personDeleted = remaining.length === 0;
  if (personDeleted) {
    // anything still stamped with another tenant here is inconsistent data, not a second
    // tenancy — the person carries none.
    const leftover = (await ops.loadAddresses(ctx.parentKey)).filter((a) => tenantsOf(a).length > 0);
    if (leftover.length > 0) await ops.deleteAll(leftover);
    const person = await ops.loadPerson(ctx.personKey);
    const user = await ops.loadUser(ctx.uid);
    const remainingAvatar = await ops.loadAvatar(ctx.parentKey);
    const toDelete = [person, user, remainingAvatar].filter((d): d is DocumentSnapshot => !!d);
    if (toDelete.length > 0) await ops.deleteAll(toDelete);
    if (remainingAvatar) await deleteAvatarObject(remainingAvatar, ops);
    await ops.deleteAuthUser(ctx.uid);
  }

  // 6 — the projection. Explicit, because a delete of the last address may not fire the
  //     parent trigger and a stale `address-directory` doc would outlive the erasure.
  await ops.rebuildAddressDirectory(ctx.parentKey);

  // 7 — evidence.
  await ops.writeErasureLog({
    okey: randomUUID(),
    tenantId: ctx.tenantId,
    tenants: [ctx.tenantId],
    executedAt,
    pseudonym,
    counts,
    trigger: options.trigger ?? 'self',
  });

  return {
    executedAt,
    pseudonym,
    counts,
    addressesDetached: addressResult.detached,
    addressesDeleted: addressResult.deleted,
    personDeleted,
    authUserDeleted: personDeleted,
  };
}

// ────────────────────────────────────────────────────────────────────────────────────
// Production wiring.
// ────────────────────────────────────────────────────────────────────────────────────

/** Firestore caps a batch at 500 writes; 400 leaves room for the odd extra. */
const BATCH_SIZE = 400;

function chunk<T>(items: readonly T[], size = BATCH_SIZE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function docOrUndefined(db: Firestore, collection: string, id: string): Promise<DocumentSnapshot | undefined> {
  if (!id) return undefined;
  const snapshot = await db.collection(collection).doc(id).get();
  return snapshot.exists ? snapshot : undefined;
}

export function firestoreErasureOps(db: Firestore = getFirestore()): ErasureOps {
  return {
    resolve: (entry, ctx) => resolveDocs(entry, ctx),

    deleteAll: async (docs) => {
      for (const part of chunk(docs)) {
        const batch = db.batch();
        for (const doc of part) batch.delete(doc.ref);
        await batch.commit();
      }
      return docs.length;
    },

    patchAll: async (patches) => {
      for (const part of chunk(patches)) {
        const batch = db.batch();
        for (const p of part) batch.update(p.doc.ref, p.patch);
        await batch.commit();
      }
      return patches.length;
    },

    detachTenant: async (docs, tenantId) => {
      let detached = 0;
      let deleted = 0;
      for (const part of chunk(docs)) {
        const batch = db.batch();
        for (const doc of part) {
          const remaining = tenantsOf(doc).filter((t) => t !== tenantId);
          if (remaining.length === 0) {
            batch.delete(doc.ref);
            deleted++;
          } else {
            batch.update(doc.ref, { tenants: FieldValue.arrayRemove(tenantId) });
          }
          detached++;
        }
        await batch.commit();
      }
      return { detached, deleted };
    },

    loadAddresses: async (parentKey) => {
      const snapshot = await db.collection(AddressCollection).where('parentKey', '==', parentKey).get();
      return snapshot.docs;
    },

    loadAvatar: (parentKey) => docOrUndefined(db, AvatarCollection, parentKey),

    deleteAvatarFile: async (storagePath) => {
      try {
        await getStorage().bucket().file(storagePath).delete();
      } catch (err) {
        // Best-effort, like deleteAuthUser: the document is already gone, and an image
        // that was never uploaded (or already reaped) must not fail the erasure. It is
        // logged, because a file that survives its document is a residual copy.
        logger.warn(`eraseMyData: could not delete the avatar file at ${storagePath}: ${String(err)}`);
      }
    },

    loadPerson: (personKey) => docOrUndefined(db, PersonCollection, personKey),
    loadUser: (uid) => docOrUndefined(db, UserCollection, uid),

    personTenantsAfterDetach: async (personKey) => db.runTransaction(async (tx) => {
      const snapshot = await tx.get(db.collection(PersonCollection).doc(personKey));
      if (!snapshot.exists) return [];
      return (snapshot.get('tenants') as string[] | undefined) ?? [];
    }),

    deleteAuthUser: async (uid) => {
      try {
        await getAuth().deleteUser(uid);
      } catch (err) {
        // The Firestore side is already erased at this point; a missing or already
        // deleted Auth user must not roll the run back into an inconsistent state.
        logger.warn(`eraseMyData: could not delete the auth user: ${String(err)}`);
      }
    },

    rebuildAddressDirectory: (parentKey) => writeAddressDirectory(db, parentKey),

    writeErasureLog: async (entry) => {
      await db.collection(ErasureLogCollection).doc(entry.okey).set(entry);
    },
  };
}

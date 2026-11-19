import type { DocumentReference, Firestore } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';

import { AddressCollection, AddressModel } from '@okr/shared-models';

import { AddressSnapshot, buildRegisterLocation, findOrCreateRegisterLocation, ManualAddressInput, RegisterAddressInput, snapshotFromLocation } from './address-register.util';
import { geocodeSnapshot } from './swisstopo.util';

/**
 * Spec 1.164 §5.2 / §7.4: postal residences are linked to a register location and carry their
 * parent's tenants. Old clients write postal rows without a link (or overwrite the snapshot of a
 * linked row); `onAddressChange` heals them with these helpers, and the parent triggers keep
 * `tenants` in sync. Every write is read-compared, so a heal write that re-triggers
 * `onAddressChange` ends in `none`.
 */
export type HealAction = 'none' | 'link' | 'relink' | 'tenants-only';

const SNAPSHOT_FIELDS = ['streetName', 'streetNumber', 'zipCode', 'city', 'countryCode'] as const;

function str(value: unknown): string {
  return String(value ?? '');
}

function snapshotChanged(before: AddressModel, after: AddressModel): boolean {
  return SNAPSHOT_FIELDS.some((f) => str(before[f]) !== str(after[f]));
}

/** Order-insensitive equality of two tenant lists. */
function sameTenants(a: string[] | undefined, b: string[] | undefined): boolean {
  const x = [...new Set(a ?? [])].sort();
  const y = [...new Set(b ?? [])].sort();
  return x.length === y.length && x.every((t, i) => t === y[i]);
}

/** Fields a tenants-only diff ignores: `okey` is attached on read and may be missing on one side. */
const NON_CONTENT_FIELDS = ['tenants', 'index', 'okey'];

/** True when nothing but `tenants` / `index` differs — the change our own tenants sync makes. */
function onlyTenantsOrIndexChanged(before: AddressModel, after: AddressModel): boolean {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const f of NON_CONTENT_FIELDS) keys.delete(f);
  return [...keys].every((k) => JSON.stringify((before as unknown as Record<string, unknown>)[k] ?? null) === JSON.stringify((after as unknown as Record<string, unknown>)[k] ?? null));
}

/**
 * What the heal must do with a written address row (pure).
 * - `link`: an active postal row without `locationKey` (an old-client write). A write that changed
 *   only `tenants` does not re-attempt the link — that is our own sync (or an unresolvable geocode
 *   already tried), and re-geocoding on it would only repeat the miss.
 * - `relink`: a linked row whose snapshot changed while `locationKey` stayed the same — an old
 *   client corrected the address (never a move). If `locationKey` changed in the same write, the
 *   writer already linked it.
 * - `tenants-only`: the row's `tenants` differ from the parent's.
 * - `none`: anything else, including a change of `addressValue2` alone, non-postal and archived rows.
 */
export function healDecision(before: AddressModel | undefined, after: AddressModel, parentTenants: string[]): HealAction {
  if (after.addressChannel !== 'postal' || after.isArchived) return 'none';
  const locationKey = str(after.locationKey);
  const tenantsDiffer = !sameTenants(after.tenants, parentTenants);
  if (!locationKey) {
    if (before && onlyTenantsOrIndexChanged(before, after)) return tenantsDiffer ? 'tenants-only' : 'none';
    return 'link';
  }
  if (before && str(before.locationKey) === locationKey && snapshotChanged(before, after)) return 'relink';
  return tenantsDiffer ? 'tenants-only' : 'none';
}

function isSwiss(countryCode: string | undefined): boolean {
  const cc = str(countryCode).trim().toUpperCase();
  return cc === '' || cc === 'CH';
}

/** Finds or creates the register location for the row's snapshot; undefined when a Swiss address cannot be resolved exactly. */
async function resolveLocation(db: Firestore, row: AddressModel, fetchFn?: typeof fetch): Promise<{ key: string; snapshot: AddressSnapshot } | undefined> {
  let input: RegisterAddressInput;
  if (isSwiss(row.countryCode)) {
    const outcome = await geocodeSnapshot(
      { streetName: str(row.streetName), streetNumber: str(row.streetNumber), zipCode: str(row.zipCode), city: str(row.city) },
      fetchFn,
    );
    if (outcome.kind !== 'exact') {
      logger.info(`residence ${row.okey}: swisstopo result '${outcome.kind}', left unlinked`);
      return undefined;
    }
    input = outcome.hit;
  } else {
    const manual: ManualAddressInput = {
      streetName: str(row.streetName),
      streetNumber: str(row.streetNumber),
      zipCode: str(row.zipCode),
      city: str(row.city),
      countryCode: str(row.countryCode),
    };
    input = manual;
  }
  const key = await findOrCreateRegisterLocation(db, input);
  return { key, snapshot: snapshotFromLocation(buildRegisterLocation(input)) };
}

/**
 * Applies a heal decision to the row at `ref`. `link` / `relink`: exact swisstopo hit → find or
 * create the register location and write `locationKey` + snapshot; a Swiss address without an exact
 * hit stays (or becomes) unlinked; a foreign address gets a manual location. `tenants` is always set
 * to `parentTenants`. Never touches `validFrom` / `validTo`. Writes only the fields that differ,
 * and nothing at all when none do. Never throws on a swisstopo failure.
 */
export async function healResidence(
  db: Firestore,
  ref: DocumentReference,
  row: AddressModel,
  action: HealAction,
  parentTenants: string[],
  fetchFn?: typeof fetch,
): Promise<void> {
  if (action === 'none') return;
  const patch: Record<string, unknown> = {};
  if (action === 'link' || action === 'relink') {
    const resolved = await resolveLocation(db, row, fetchFn);
    if (resolved) {
      if (str(row.locationKey) !== resolved.key) patch['locationKey'] = resolved.key;
      for (const f of SNAPSHOT_FIELDS) {
        if (str(row[f]) !== resolved.snapshot[f]) patch[f] = resolved.snapshot[f];
      }
    } else if (str(row.locationKey)) {
      // a corrected address that no longer matches its old location: drop the stale link
      patch['locationKey'] = '';
    }
  }
  if (!sameTenants(row.tenants, parentTenants)) patch['tenants'] = [...parentTenants];
  if (Object.keys(patch).length === 0) return;
  await ref.update(patch);
  logger.info(`residence ${ref.id}: healed (${action})`, { fields: Object.keys(patch) });
}

/**
 * Sets `tenants` of every postal row of `parentKey` (archived ones included, so a removed tenant
 * also loses sight of the history) to the parent's tenants. Returns the number of rows written.
 */
export async function syncResidenceTenants(db: Firestore, parentKey: string, tenants: string[]): Promise<number> {
  const snapshot = await db.collection(AddressCollection).where('parentKey', '==', parentKey).get();
  let written = 0;
  for (const doc of snapshot.docs) {
    const row = doc.data() as AddressModel;
    if (row.addressChannel !== 'postal' || sameTenants(row.tenants, tenants)) continue;
    await doc.ref.update({ tenants: [...tenants] });
    written++;
  }
  if (written > 0) logger.info(`synced tenants of ${written} residence(s) of ${parentKey}`);
  return written;
}

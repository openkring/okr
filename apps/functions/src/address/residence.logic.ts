/**
 * Spec 1.164 §6.1–§6.5: the pure half of the move callables — the move / cancel planners, the
 * permission predicate and input validation. No Firestore here; `residence.callables.ts` loads the
 * data, asks these functions and writes.
 */
import { createHash } from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';

import { DEFAULT_ADDRESS_USAGE } from '@okr/shared-constants';

import { AddressModel } from '@okr/shared-models';
import { dayBefore, isAfterDate, isPostalResidence, isRenderableStoreDate } from '@okr/shared-util-core';
import type { ManualAddressInput, SwissAddressHit } from '@okr/shared-util-functions';

export const MAX_TEXT_LENGTH = 200;
export const MIN_QUERY_LENGTH = 3;
const MAX_KEY_LENGTH = 100;
const KEY_PATTERN = /^[A-Za-z0-9_-]+$/;

// ---------------------------------------------------------------------------------------------
// planners
// ---------------------------------------------------------------------------------------------

export interface MovePlan {
  /** the open row of the chain the new residence follows; it ends the day before the move */
  close: { okey: string; validTo: string } | undefined;
  /** the new row is the favorite postal row at once (only when the move is not in the future) */
  newIsFavorite: boolean;
  /** rows that lose the favorite flag in the same write (only ever the closed row) */
  demote: string[];
  /** the addressUsage of the new row: the chain's usage, else the requested one */
  addressUsage: string;
}

/** '' (unknown start) sorts first: a row with a known start is the later one. */
function byValidFrom(a: AddressModel, b: AddressModel): number {
  return (a.validFrom ?? '').localeCompare(b.validFrom ?? '');
}

const usageOf = (r: AddressModel): string => r.addressUsage || DEFAULT_ADDRESS_USAGE;

/**
 * Plans a move to `validFrom` away from the residence `fromOkey`. The chain is every active postal
 * row with the same addressUsage as `fromOkey` (a home move never touches the work address); the
 * row to close is the chain's latest open row (`validTo` empty): an announced future row if there is
 * one, else the current one. `fromOkey` is required as soon as the parent has any open postal row;
 * without one, the new row starts a chain of `addressUsage` (default 'home').
 * Refused with `invalid-argument`: a missing or unknown `fromOkey`, and a move that does not start
 * after the start of the row it closes (it would end that row before it began; for an announced
 * move, the user must edit or cancel it first).
 */
export function planMove(rows: AddressModel[], validFrom: string, today: string, fromOkey = '', addressUsage = DEFAULT_ADDRESS_USAGE): MovePlan {
  const postal = rows.filter(isPostalResidence);
  let usage = addressUsage || DEFAULT_ADDRESS_USAGE;
  let toClose: AddressModel | undefined;
  if (fromOkey) {
    const from = postal.find((r) => r.okey === fromOkey);
    if (!from) throw new HttpsError('invalid-argument', `fromResidenceKey ${fromOkey} is not an active postal address of this parent`);
    usage = usageOf(from);
    const open = postal.filter((r) => usageOf(r) === usage && !r.validTo).sort(byValidFrom);
    const latest = open[open.length - 1] as AddressModel | undefined;
    if (latest?.validFrom && !isAfterDate(validFrom, latest.validFrom)) {
      throw new HttpsError('invalid-argument', `move date ${validFrom} is not after the start ${latest.validFrom} of the open residence ${latest.okey}`);
    }
    // several open rows of one usage with the same start: prefer the one the user chose, then the favorite, then the lowest okey
    const sameStart = open.filter((r) => (r.validFrom ?? '') === (latest?.validFrom ?? ''));
    toClose = sameStart.find((r) => r.okey === fromOkey) ?? sameStart.find((r) => r.isFavorite) ?? [...sameStart].sort((a, b) => a.okey.localeCompare(b.okey))[0];
  } else if (postal.some((r) => !r.validTo)) {
    throw new HttpsError('invalid-argument', 'fromResidenceKey is required: choose the address you move away from');
  }

  const notInFuture = !isAfterDate(validFrom, today);
  const hasFavorite = postal.some((r) => r.isFavorite);
  const newIsFavorite = notInFuture && (!!toClose?.isFavorite || !hasFavorite);
  return {
    close: toClose ? { okey: toClose.okey, validTo: dayBefore(validFrom) } : undefined,
    newIsFavorite,
    demote: newIsFavorite && toClose?.isFavorite ? [toClose.okey] : [],
    addressUsage: usage,
  };
}

/**
 * Cancelling an announced move: its predecessor (the row that ends the day before it starts) takes
 * over the cancelled row's own `validTo` — `''` only when the cancelled row was open. In a chain
 * C → F1 → F2, cancelling F1 extends C to the day before F2, so no two rows stay open.
 */
export function planCancel(rows: AddressModel[], futureOkey: string): { reopen: { okey: string; validTo: string } | undefined } {
  const postal = rows.filter(isPostalResidence);
  const future = postal.find((r) => r.okey === futureOkey);
  if (!future?.validFrom) return { reopen: undefined };
  const end = dayBefore(future.validFrom);
  const candidates = postal.filter((r) => r.okey !== futureOkey && r.validTo === end && usageOf(r) === usageOf(future));
  const pick = candidates.find((r) => r.isFavorite) ?? [...candidates].sort((a, b) => a.okey.localeCompare(b.okey))[0];
  return { reopen: pick ? { okey: pick.okey, validTo: future.validTo ?? '' } : undefined };
}

/** Deterministic id of a new residence without predecessor: a concurrent double submit collides on `create`. */
export function newResidenceId(parentKey: string, validFrom: string, locationKey: string): string {
  return 'res-' + createHash('sha256').update([parentKey, validFrom, locationKey].join('|')).digest('hex').substring(0, 32);
}

/**
 * How a first residence is written at its deterministic id: `create` when no doc is there,
 * `overwrite` when the doc there is archived (a cancelled move recorded again, e.g. «Umzug
 * bearbeiten» = cancel + record with only the c/o line changed), `exists` when a live residence is
 * already there (the same move submitted twice).
 */
export function firstResidenceWrite(existing: Record<string, unknown> | undefined): 'create' | 'overwrite' | 'exists' {
  if (!existing) return 'create';
  return existing['isArchived'] === true ? 'overwrite' : 'exists';
}

/** Fields of the archived doc the new row does not have: deleted, so the overwrite is complete. */
export function strayFields(existing: Record<string, unknown>, next: Record<string, unknown>): string[] {
  return Object.keys(existing).filter((k) => !(k in next));
}

/**
 * Maps a failed batch commit: a broken `lastUpdateTime` precondition (gRPC 9, a row changed since it
 * was read) → `aborted`; a `create` on an existing id (gRPC 6, the same move submitted twice) →
 * `already-exists`; anything else is rethrown unchanged.
 */
export function commitError(err: unknown): unknown {
  const code = (err as { code?: unknown })?.code;
  if (code === 9 || code === 'failed-precondition') {
    return new HttpsError('aborted', 'Die Adresse wurde inzwischen geändert. Lade sie neu und versuche es nochmals.');
  }
  if (code === 6 || code === 'already-exists') {
    return new HttpsError('already-exists', 'Dieser Umzug ist schon erfasst.');
  }
  return err;
}

// ---------------------------------------------------------------------------------------------
// permission (spec §6.5) — the gate of every write callable
// ---------------------------------------------------------------------------------------------

/** What the server knows about the caller, read from `users/{uid}` (never from claims or request data). */
export interface CallerFacts {
  personKey: string;
  tenants: string[];
  roles: Record<string, unknown>;
}

const RECORDER_ROLES = ['privileged', 'admin', 'memberAdmin'];

/**
 * Owner of a person parent, or privileged / admin / memberAdmin with a tenant shared with the
 * parent. Org parents: the roles only. Mirrors the rules' `canWriteSensitive` (isPrivileged covers
 * admin), narrowed to the parent's tenants.
 */
export function mayRecordPostal(caller: CallerFacts, parentKey: string, parentTenants: string[]): boolean {
  if (caller.personKey && parentKey === `person.${caller.personKey}`) return true;
  const hasRole = RECORDER_ROLES.some((r) => caller.roles[r] === true);
  return hasRole && caller.tenants.some((t) => parentTenants.includes(t));
}

/** True when the caller records for themself (notices treat the owner differently, §6.4). */
export function isOwnerOf(caller: CallerFacts, parentKey: string): boolean {
  return !!caller.personKey && parentKey === `person.${caller.personKey}`;
}

/** The caller's tenant shared with the parent, else the caller's first tenant, else ''. */
export function recorderTenantId(callerTenants: string[], parentTenants: string[]): string {
  return callerTenants.find((t) => parentTenants.includes(t)) ?? callerTenants[0] ?? '';
}

// ---------------------------------------------------------------------------------------------
// input validation
// ---------------------------------------------------------------------------------------------

function invalid(message: string): HttpsError {
  return new HttpsError('invalid-argument', message);
}

export function requireQuery(value: unknown): string {
  if (typeof value !== 'string') throw invalid('query must be a string');
  const q = value.trim();
  if (q.length < MIN_QUERY_LENGTH || q.length > MAX_TEXT_LENGTH) throw invalid(`query must have ${MIN_QUERY_LENGTH}..${MAX_TEXT_LENGTH} characters`);
  return q;
}

export function requireStoreDate(value: unknown, field: string): string {
  if (typeof value !== 'string' || !isRenderableStoreDate(value)) throw invalid(`${field} must be a date YYYYMMDD`);
  return value;
}

export function requireParentKey(value: unknown): string {
  if (typeof value !== 'string') throw invalid('parentKey must be a string');
  const m = /^(person|org)\.(.+)$/.exec(value);
  if (!m || m[2].length > MAX_KEY_LENGTH || !KEY_PATTERN.test(m[2])) throw invalid('parentKey must be person.<key> or org.<key>');
  return value;
}

export function requireDocKey(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_KEY_LENGTH || !KEY_PATTERN.test(value)) throw invalid(`${field} is not a valid key`);
  return value;
}

/** Optional addressUsage of a first residence (a category key). */
export function requireAddressUsage(value: unknown): string {
  if (value === undefined || value === null || value === '') return DEFAULT_ADDRESS_USAGE;
  if (typeof value !== 'string' || value.length > 50 || !KEY_PATTERN.test(value)) throw invalid('addressUsage is not a valid usage');
  return value;
}

/** c/o line, apartment / floor: optional, trimmed. */
export function requireAddressValue2(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string' || value.trim().length > MAX_TEXT_LENGTH) throw invalid(`addressValue2 must be a string of at most ${MAX_TEXT_LENGTH} characters`);
  return value.trim();
}

function text(value: unknown, field: string, required: boolean): string {
  if (value === undefined || value === null) {
    if (required) throw invalid(`${field} is required`);
    return '';
  }
  if (typeof value !== 'string') throw invalid(`${field} must be a string`);
  const t = value.trim();
  if (required && !t) throw invalid(`${field} is required`);
  if (t.length > MAX_TEXT_LENGTH) throw invalid(`${field} must have at most ${MAX_TEXT_LENGTH} characters`);
  return t;
}

/**
 * The move target. A swisstopo `hit` is reduced to egaid + label: the client's coordinates and
 * address parts are never trusted, the server re-runs the search with the label and uses its own
 * hit with that egaid. `egaid` without `hit` cannot be re-searched and is refused.
 */
export type ParsedTarget = { kind: 'hit'; egaid: string; label: string } | { kind: 'manual'; manual: ManualAddressInput };

export function parseTarget(value: unknown): ParsedTarget {
  if (!value || typeof value !== 'object') throw invalid('target is required');
  const t = value as { egaid?: unknown; hit?: unknown; manual?: unknown };
  if (t.hit !== undefined && t.manual !== undefined) throw invalid('target takes either hit or manual, not both');
  if (t.hit !== undefined) {
    const hit = t.hit as Partial<Record<keyof SwissAddressHit, unknown>> | null;
    if (!hit || typeof hit !== 'object') throw invalid('target.hit must be an object');
    const egaid = typeof hit.egaid === 'string' || typeof hit.egaid === 'number' ? String(hit.egaid) : '';
    if (!/^\d{1,20}$/.test(egaid)) throw invalid('target.hit.egaid must be a number');
    if (t.egaid !== undefined && String(t.egaid) !== egaid) throw invalid('target.egaid does not match target.hit.egaid');
    const label = text(hit.label, 'target.hit.label', true);
    if (label.length < MIN_QUERY_LENGTH) throw invalid('target.hit.label is too short');
    return { kind: 'hit', egaid, label };
  }
  if (t.manual !== undefined) {
    const m = t.manual as Partial<Record<keyof ManualAddressInput, unknown>> | null;
    if (!m || typeof m !== 'object') throw invalid('target.manual must be an object');
    const countryCode = text(m.countryCode, 'target.manual.countryCode', true).toUpperCase();
    if (!/^[A-Z]{2}$/.test(countryCode)) throw invalid('target.manual.countryCode must be a two-letter country code');
    return {
      kind: 'manual',
      manual: {
        streetName: text(m.streetName, 'target.manual.streetName', true),
        streetNumber: text(m.streetNumber, 'target.manual.streetNumber', false),
        zipCode: text(m.zipCode, 'target.manual.zipCode', true),
        city: text(m.city, 'target.manual.city', true),
        countryCode,
      },
    };
  }
  if (t.egaid !== undefined) throw invalid('target.egaid needs the chosen target.hit');
  throw invalid('target needs hit or manual');
}

/** The server's own hit for the egaid the client chose; undefined = the address is not (or no longer) found. */
export function matchServerHit(hits: SwissAddressHit[], egaid: string): SwissAddressHit | undefined {
  return hits.find((h) => h.egaid === egaid);
}

// ---------------------------------------------------------------------------------------------
// texts
// ---------------------------------------------------------------------------------------------

type SnapshotParts = Pick<AddressModel, 'streetName' | 'streetNumber' | 'zipCode' | 'city'>;

/** «Seestrasse 12, 8712 Stäfa» for the notices; empty parts are left out. */
export function snapshotText(a: SnapshotParts): string {
  const street = [a.streetName, a.streetNumber].map((s) => (s ?? '').trim()).filter(Boolean).join(' ');
  const place = [a.zipCode, a.city].map((s) => (s ?? '').trim()).filter(Boolean).join(' ');
  return [street, place].filter(Boolean).join(', ');
}

/**
 * The search index of a postal row, as the client's `getAddressIndex` builds it (that one lives in
 * `@okr/subject-address-util`, which reaches Angular). The owner segment stays empty here:
 * `onAddressChange` fills it on the write.
 */
export function postalIndex(a: Pick<AddressModel, 'streetName' | 'streetNumber' | 'countryCode' | 'zipCode' | 'city' | 'parentKey'>): string {
  return `n:${a.streetName ?? ''}${a.streetNumber ?? ''}${a.countryCode ?? ''}${a.zipCode ?? ''}${a.city ?? ''} p:${a.parentKey ?? ''} o:`;
}

/**
 * Spec 1.164 §6.1–§6.5: the pure half of the move callables — the move / cancel planners, the
 * permission predicate and input validation. No Firestore here; `residence.callables.ts` loads the
 * data, asks these functions and writes.
 */
import { HttpsError } from 'firebase-functions/v2/https';

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
  /** the open row the new residence follows; it ends the day before the move */
  close: { okey: string; validTo: string } | undefined;
  /** the new row is the favorite postal row at once (only when the move is not in the future) */
  newIsFavorite: boolean;
  /** rows that lose the favorite flag in the same batch */
  demote: string[];
}

/** '' (unknown start) sorts first: a row with a known start is the later one. */
function byValidFrom(a: AddressModel, b: AddressModel): number {
  return (a.validFrom ?? '').localeCompare(b.validFrom ?? '');
}

/**
 * Plans a move to `validFrom`. The row to close is the latest open postal row (`validTo` empty):
 * an announced future row if there is one, else the current one. A move that does not start after
 * that row's start is refused (`invalid-argument`) — it would end the row before it began, and for
 * an announced move it means the user must edit or cancel that move first.
 */
export function planMove(rows: AddressModel[], validFrom: string, today: string): MovePlan {
  const postal = rows.filter(isPostalResidence);
  const open = postal.filter((r) => !r.validTo).sort(byValidFrom);
  const latest = open[open.length - 1] as AddressModel | undefined;
  if (latest?.validFrom && !isAfterDate(validFrom, latest.validFrom)) {
    throw new HttpsError('invalid-argument', `move date ${validFrom} is not after the start ${latest.validFrom} of the open residence ${latest.okey}`);
  }
  // several open rows with the same start (home + work): prefer the favorite, then the lowest okey
  const sameStart = open.filter((r) => (r.validFrom ?? '') === (latest?.validFrom ?? ''));
  const toClose = sameStart.find((r) => r.isFavorite) ?? [...sameStart].sort((a, b) => a.okey.localeCompare(b.okey))[0];

  const notInFuture = !isAfterDate(validFrom, today);
  const hasFavorite = postal.some((r) => r.isFavorite);
  const newIsFavorite = notInFuture && (!!toClose?.isFavorite || !hasFavorite);
  return {
    close: toClose ? { okey: toClose.okey, validTo: dayBefore(validFrom) } : undefined,
    newIsFavorite,
    demote: newIsFavorite && toClose?.isFavorite ? [toClose.okey] : [],
  };
}

/** Cancelling an announced move: the row that ends the day before it starts is reopened (`validTo = ''`). */
export function planCancel(rows: AddressModel[], futureOkey: string): { reopen: string | undefined } {
  const postal = rows.filter(isPostalResidence);
  const future = postal.find((r) => r.okey === futureOkey);
  if (!future?.validFrom) return { reopen: undefined };
  const end = dayBefore(future.validFrom);
  const candidates = postal.filter((r) => r.okey !== futureOkey && r.validTo === end);
  const pick = candidates.find((r) => r.isFavorite) ?? [...candidates].sort((a, b) => a.okey.localeCompare(b.okey))[0];
  return { reopen: pick?.okey };
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

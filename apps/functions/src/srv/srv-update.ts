/**
 * Safe write path to Regasoft (spec 1.133 D1, D11, D12) — pure, dependency-injected, no Firebase.
 *
 * Regasoft's `PUT` replaces the WHOLE record: every writable field that is not sent is set to
 * `null` (probe 2026-11-02: `entryDate` was erased that way), and a member record can never be
 * deleted. So an update always reads the current record uncached, overlays only the changed
 * fields onto the record AS READ — every key, including ones our model does not know — sends the
 * complete record back, and reads it again, because a `200` does not prove that a field was written.
 * See planning/reference/REGASOFT.md «Write behaviour».
 */
import { HttpsError } from 'firebase-functions/v2/https';
import { END_FUTURE_DATE_STR } from '@okr/shared-constants';
import { regasoftDateToStoreDate, storeDateToRegasoftDate } from '@okr/shared-util-core';
import {
  SRV_WRITABLE_FIELDS,
  SrvChanges,
  SrvContactData,
  SrvPreview,
  SrvUpdateResult,
  SrvWritableField,
} from '@okr/shared-models';

type SrvRecord = Record<string, unknown>;

/** Reads one raw Regasoft record (uncached); `null` when Regasoft has none. */
export type SrvRead = (rid: number) => Promise<SrvRecord | null>;
/** Sends the complete record with `PUT`. */
export type SrvWrite = (rid: number, payload: SrvRecord) => Promise<void>;

const WRITABLE = new Set<string>(SRV_WRITABLE_FIELDS);
const DATE_FIELDS = new Set<SrvWritableField>(['birthday', 'dateOfDeath', 'leavingDate', 'inactiveDate']);
const NUMBER_FIELDS = new Set<SrvWritableField>(['gender', 'countryId']);

const MISSING_REQUIRED = 'Regasoft verlangt Geburtsdatum und Geschlecht';
/** The trailing marker the Regasoft test system adds to every email so no mail reaches a real person. */
const TEST_EMAIL_MARK = 'x';

const isEmpty = (v: unknown): boolean => v === null || v === undefined || v === '';

/** In the test system, drop the trailing `x` Regasoft adds to every email (D11, read side). */
export function stripTestEmail(email: string | null, testSystem: boolean): string | null {
  if (!testSystem || !email || !email.endsWith(TEST_EMAIL_MARK)) return email;
  return email.slice(0, -TEST_EMAIL_MARK.length);
}

/** A changed email as it is written: in the test system with the `x` appended (D11, write side). */
function writeEmail(value: string | number | null, testSystem: boolean): string | null {
  if (isEmpty(value)) return null;
  const email = String(value);
  return testSystem ? `${email}${TEST_EMAIL_MARK}` : email;
}

/**
 * A StoreDate change as a Regasoft date. Empty clears the field (`null`). `undefined` = drop the
 * change: a partial birthday (year only, no year) must never replace Regasoft's full date. Any
 * other value that is not a full date — and the no-exit placeholder — is refused rather than
 * silently clearing a status date, because clearing `leavingDate` re-activates a member.
 */
function writeDate(field: SrvWritableField, value: string | number | null): string | null | undefined {
  if (isEmpty(value)) return null;
  const storeDate = String(value);
  if (storeDate === END_FUTURE_DATE_STR) {
    throw new HttpsError('invalid-argument', `${field}: the no-exit placeholder is not a date`);
  }
  const converted = storeDateToRegasoftDate(storeDate);
  if (converted !== null) return converted;
  if (field === 'birthday') return undefined;
  throw new HttpsError('invalid-argument', `${field}: '${storeDate}' is not a full date`);
}

function writeNumber(field: SrvWritableField, value: string | number | null): number | null {
  if (isEmpty(value)) return null;
  const n = Number(value);
  if (!Number.isInteger(n)) throw new HttpsError('invalid-argument', `${field} must be a number`);
  return n;
}

function assertRequired(record: SrvRecord): void {
  if (isEmpty(record['birthday']) || isEmpty(record['gender'])) {
    throw new HttpsError('failed-precondition', MISSING_REQUIRED);
  }
}

/**
 * The complete record to `PUT`: the raw Regasoft record with `changes` laid over it.
 * Rejects any key Regasoft does not accept; never mutates `raw`.
 */
export function mergeSrvRecord(raw: SrvRecord, changes: SrvChanges, opts: { testSystem: boolean }): SrvRecord {
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
    throw new HttpsError('invalid-argument', 'changes must be an object');
  }
  const rejected = Object.keys(changes).filter((k) => !WRITABLE.has(k));
  if (rejected.length > 0) {
    throw new HttpsError('invalid-argument', `Not writable to Regasoft: ${rejected.join(', ')}`);
  }

  const merged: SrvRecord = { ...raw };
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined) continue;
    const field = key as SrvWritableField;
    if (DATE_FIELDS.has(field)) {
      const date = writeDate(field, value);
      if (date !== undefined) merged[field] = date;
    } else if (NUMBER_FIELDS.has(field)) {
      merged[field] = writeNumber(field, value);
    } else if (field === 'email') {
      merged[field] = writeEmail(value, opts.testSystem);
    } else {
      merged[field] = isEmpty(value) ? null : String(value);
    }
  }

  assertRequired(merged);
  return merged;
}

/** Same value as Regasoft stores it: empty values are equal, dates compare by day. */
function sameSrvValue(field: SrvWritableField, a: unknown, b: unknown): boolean {
  if (isEmpty(a) || isEmpty(b)) return isEmpty(a) && isEmpty(b);
  if (DATE_FIELDS.has(field)) return regasoftDateToStoreDate(String(a)) === regasoftDateToStoreDate(String(b));
  return String(a) === String(b);
}

/** The writable fields whose value differs between two records. */
export function changedFields(before: SrvRecord, after: SrvRecord): SrvWritableField[] {
  return SRV_WRITABLE_FIELDS.filter((f) => !sameSrvValue(f, before[f], after[f]));
}

/** Of `fields`, those that Regasoft did not take: the value read back differs from the one sent. */
export function ignoredFields(sent: SrvRecord, after: SrvRecord, fields: SrvWritableField[]): SrvWritableField[] {
  return fields.filter((f) => !sameSrvValue(f, sent[f], after[f]));
}

/**
 * A record for display: in the test system the email without its `x` (D11). Only the returned
 * `before` / `after` are display copies; the PUT body and the preview's `payload` stay raw.
 */
function displayCopy(record: SrvRecord, testSystem: boolean): SrvRecord {
  const copy: SrvRecord = { ...record };
  if (typeof copy['email'] === 'string') copy['email'] = stripTestEmail(copy['email'], testSystem);
  return copy;
}

async function readExisting(rid: number, read: SrvRead): Promise<SrvRecord> {
  const record = await read(rid);
  if (!record) throw new HttpsError('not-found', `Regasoft has no member ${rid}`);
  if (Number(record['id']) !== rid) {
    throw new HttpsError('internal', `Regasoft answered member ${String(record['id'])} for ${rid}`);
  }
  return record;
}

interface SrvMergeArgs {
  rid: number;
  changes: SrvChanges;
  testSystem: boolean;
  read: SrvRead;
}

/**
 * Dry run (D12): the record before and after (display copies) and the exact payload (raw, as it
 * would be sent). Sends nothing.
 */
export async function runSrvPreview(args: SrvMergeArgs): Promise<SrvPreview> {
  const before = await readExisting(args.rid, args.read);
  const payload = mergeSrvRecord(before, args.changes, { testSystem: args.testSystem });
  return {
    before: displayCopy(before, args.testSystem),
    after: displayCopy(payload, args.testSystem),
    payload,
  };
}

/**
 * Read-modify-write. The record is read HERE, at update time — never taken from a preview —
 * so a change made in Regasoft between preview and confirm is kept. Nothing is sent when the
 * merge changes no writable field. `onWritten` runs right after the `PUT` (cache invalidation),
 * before the read-back, so it also runs when the read-back fails. Fields are compared on the raw
 * records; only the returned `before` / `after` are display copies.
 */
export async function runSrvUpdate(
  args: SrvMergeArgs & { write: SrvWrite; onWritten?: () => Promise<void> },
): Promise<SrvUpdateResult> {
  const before = await readExisting(args.rid, args.read);
  const payload = mergeSrvRecord(before, args.changes, { testSystem: args.testSystem });
  const fields = changedFields(before, payload);
  if (fields.length === 0) {
    const shown = displayCopy(before, args.testSystem);
    return { before: shown, after: { ...shown }, written: [], ignored: [] };
  }

  await args.write(args.rid, payload);
  await args.onWritten?.();

  const after = await readExisting(args.rid, args.read);
  const ignored = ignoredFields(payload, after, fields);
  return {
    before: displayCopy(before, args.testSystem),
    after: displayCopy(after, args.testSystem),
    written: fields.filter((f) => !ignored.includes(f)),
    ignored,
  };
}

/**
 * The `POST` body for a new member: only writable fields plus `id: 0`. Not sent: `hasNewsletter`
 * (no consent, not writable), `hasLicense`, `membershipType` (derived), `nationIOC`, `language`,
 * `fullname`, `countryName`. A new email is a changed email, so it gets the test `x` (D11).
 */
export function buildSrvCreatePayload(data: SrvContactData, testSystem: boolean): SrvRecord {
  const payload: SrvRecord = {
    id: 0,
    firstName: data.firstName,
    lastName: data.lastName,
    email: writeEmail(data.email ?? null, testSystem),
    mobile: data.mobile ?? null,
    birthday: storeDateToRegasoftDate(data.dateOfBirth),
    gender: data.gender,
    street: data.street ?? null,
    streetAdditional: data.streetAdditional ?? null,
    postcode: data.postcode ?? null,
    city: data.city ?? null,
    countryId: data.countryId ? Number(data.countryId) || null : null,
    telefon: data.telefon ?? null,
  };
  assertRequired(payload);
  return payload;
}

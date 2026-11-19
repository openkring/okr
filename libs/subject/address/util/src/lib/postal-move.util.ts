import { DEFAULT_ADDRESS_USAGE } from '@okr/shared-constants';
import { AddressModel, UserModel } from '@okr/shared-models';
import { dayBefore, isAfterDate, residenceStatus } from '@okr/shared-util-core';

import { ADDRESSES_I18N_KEYS } from './address-i18n';
import { ManualAddressInput, PostalMoveFormModel, SwissAddressHit } from './postal-move.validations';

/**
 * Whether the user may write (create, update, archive) postal rows of a parent — the same gate as the
 * Firestore rule for postal rows (`canWriteSensitive`: owner ∨ privileged ∨ memberAdmin, spec 1.164 §6.5)
 * and the move callables. Group admins and contentAdmins edit persons, but not their home address.
 * @param parentKey `person.<key>` / `org.<key>`; '' for a parent that does not exist yet (roles only)
 */
export function canWritePostal(user: UserModel | undefined, parentKey: string): boolean {
  if (!user) return false;
  const isOwner = !!user.personKey && parentKey === `person.${user.personKey}`;
  const roles = user.roles ?? {};
  return isOwner || roles['privileged'] === true || roles['admin'] === true || roles['memberAdmin'] === true;
}

/** Which move label the action sheet shows: «Ich ziehe um» (own), «Wir ziehen um» (org), «Umzug erfassen» (other). */
export function moveActionKind(user: UserModel | undefined, parentKey: string): 'own' | 'org' | 'other' {
  if (parentKey.startsWith('org.')) return 'org';
  if (user?.personKey && parentKey === `person.${user.personKey}`) return 'own';
  return 'other';
}

/** Past and archived postal rows are not shown in the addresses accordion (spec 1.164 §6.1). */
export function hiddenInAccordion(address: AddressModel, today: string): boolean {
  if (address.addressChannel !== 'postal') return false;
  return !!address.isArchived || residenceStatus(address, today) === 'past';
}

/** «ab <date>» on an announced address, «bis <date>» on the address it replaces; nothing otherwise. */
export function residenceDateLabel(address: AddressModel, today: string): { kind: 'from' | 'until'; date: string } | undefined {
  if (address.addressChannel !== 'postal') return undefined;
  const status = residenceStatus(address, today);
  if (status === 'future') return { kind: 'from', date: address.validFrom };
  if (status === 'current' && address.validTo) return { kind: 'until', date: address.validTo };
  return undefined;
}

/** A row's usage as the server reads it: a legacy row without one is a home address. */
export function usageOf(row: Pick<AddressModel, 'addressUsage'>): string {
  return row.addressUsage || DEFAULT_ADDRESS_USAGE;
}

/**
 * The active postal row of the same usage that ends the day before `row` starts (the row a move closed).
 * A move closes every open row of its usage, so there can be several: like the server's planCancel,
 * the favorite wins, then the lowest okey.
 */
export function predecessorOf(row: AddressModel, rows: AddressModel[]): AddressModel | undefined {
  if (!row.validFrom) return undefined;
  const end = dayBefore(row.validFrom);
  const candidates = rows.filter((r) => r.okey !== row.okey && r.addressChannel === 'postal' && !r.isArchived
    && usageOf(r) === usageOf(row) && r.validTo === end);
  return candidates.find((r) => r.isFavorite) ?? [...candidates].sort((a, b) => a.okey.localeCompare(b.okey))[0];
}

/** What recordPostalMove gets, or why the server would refuse it ('date': not after the open row's start; 'from': a row to move away from is missing). */
export type MoveCheck =
  | { ok: true; fromResidenceKey: string; addressUsage: string }
  | { ok: false; reason: 'date' | 'from' };

/**
 * Mirrors the refusals of the server's planMove before anything is written: with a row to move away
 * from, the new date must be after the start of the latest open row of that usage (the server closes
 * every open row of that usage, duplicates included); without one, the parent must have no open
 * postal row at all.
 */
export function checkMove(rows: AddressModel[], from: AddressModel | undefined, validFrom: string, addressUsage = DEFAULT_ADDRESS_USAGE): MoveCheck {
  const postal = rows.filter((r) => r.addressChannel === 'postal' && !r.isArchived);
  if (!from) {
    if (postal.some((r) => !r.validTo)) return { ok: false, reason: 'from' };
    return { ok: true, fromResidenceKey: '', addressUsage: addressUsage || DEFAULT_ADDRESS_USAGE };
  }
  const usage = usageOf(from);
  const starts = postal.filter((r) => usageOf(r) === usage && !r.validTo).map((r) => r.validFrom ?? '').sort();
  const latestStart = starts[starts.length - 1];
  if (latestStart && !isAfterDate(validFrom, latestStart)) return { ok: false, reason: 'date' };
  return { ok: true, fromResidenceKey: from.okey, addressUsage: usage };
}

/**
 * «Umzug bearbeiten» = cancelPostalMove(row) + recordPostalMove. Checks the record step against the
 * rows as they are AFTER the cancel (row archived, its predecessor taking over row.validTo — planCancel),
 * so a move the server would refuse is never cancelled first.
 */
export function checkEditMove(row: AddressModel, rows: AddressModel[], validFrom: string): MoveCheck {
  const predecessor = predecessorOf(row, rows);
  const afterCancel = rows
    .filter((r) => r.okey !== row.okey)
    .map((r) => (r.okey === predecessor?.okey ? { ...r, validTo: row.validTo ?? '' } as AddressModel : r));
  const from = predecessor ? afterCancel.find((r) => r.okey === predecessor.okey) : undefined;
  return checkMove(afterCancel, from, validFrom, usageOf(row));
}

/** The callable's `target`: the chosen hit, else the manual fields in the form's country. */
export function postalTarget(model: PostalMoveFormModel): { hit: SwissAddressHit } | { manual: ManualAddressInput } {
  if (model.hit) return { hit: model.hit };
  const m = model.manual;
  return {
    manual: {
      streetName: m.streetName.trim(),
      streetNumber: m.streetNumber.trim(),
      zipCode: m.zipCode.trim(),
      city: m.city.trim(),
      countryCode: model.countryCode.trim().toUpperCase(),
    },
  };
}

export type PostalMoveErrorKind = 'invalid' | 'permission' | 'notFound' | 'conflict' | 'exists' | 'date' | 'from' | 'unknown';

/** Maps a callable error (`functions/<code>`) to the toast that explains it. */
export function postalMoveErrorKind(error: unknown): PostalMoveErrorKind {
  const raw = (error as { code?: unknown } | undefined)?.code;
  const code = typeof raw === 'string' ? raw.replace(/^functions\//, '') : '';
  switch (code) {
    case 'invalid-argument': return 'invalid';
    case 'permission-denied': return 'permission';
    case 'failed-precondition':
    case 'not-found': return 'notFound';
    case 'aborted': return 'conflict';
    case 'already-exists': return 'exists';
    default: return 'unknown';
  }
}

/** The toast text (a key of ADDRESSES_I18N_KEYS) for each kind of refused move. */
export const POSTAL_MOVE_ERROR_I18N: Record<PostalMoveErrorKind, keyof typeof ADDRESSES_I18N_KEYS> = {
  invalid: 'move_error_invalid',
  permission: 'move_error_permission',
  notFound: 'move_error_notFound',
  conflict: 'move_error_conflict',
  exists: 'move_error_exists',
  date: 'move_error_date',
  from: 'move_error_from',
  unknown: 'move_error_unknown',
};

/** Where a row stands in the privileged history: an archived row is «archived» whatever its dates say. */
export type PostalHistoryStatus = 'archived' | 'future' | 'current' | 'past';

export function postalHistoryStatus(row: AddressModel, today: string): PostalHistoryStatus {
  return row.isArchived ? 'archived' : residenceStatus(row, today);
}

/**
 * Every postal row of a parent for «Alle Adressen» (spec 1.164 §6.6): newest start first, rows without
 * a start last, ties by okey. Other channels are dropped; archived and past rows stay.
 */
export function sortPostalHistory(rows: AddressModel[]): AddressModel[] {
  return rows
    .filter((r) => r.addressChannel === 'postal')   // filter copies, so the sort leaves the input alone
    .sort((a, b) => {
      const af = a.validFrom ?? '';
      const bf = b.validFrom ?? '';
      if (af !== bf) return !af ? 1 : !bf ? -1 : bf.localeCompare(af);
      return a.okey.localeCompare(b.okey);
    });
}

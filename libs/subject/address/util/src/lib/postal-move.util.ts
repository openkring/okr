import { AddressModel, UserModel } from '@okr/shared-models';
import { dayBefore, residenceStatus } from '@okr/shared-util-core';

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

/** The active postal row of the same usage that ends the day before `row` starts (the row a move closed). */
export function predecessorOf(row: AddressModel, rows: AddressModel[]): AddressModel | undefined {
  if (!row.validFrom) return undefined;
  const end = dayBefore(row.validFrom);
  return rows.find((r) => r.okey !== row.okey && r.addressChannel === 'postal' && !r.isArchived
    && r.addressUsage === row.addressUsage && r.validTo === end);
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

export type PostalMoveErrorKind = 'invalid' | 'permission' | 'notFound' | 'conflict' | 'exists' | 'unknown';

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
  unknown: 'move_error_unknown',
};

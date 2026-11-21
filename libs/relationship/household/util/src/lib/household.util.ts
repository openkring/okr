import { HOUSEHOLD_I18N_KEYS } from './household-i18n';

/** admin: everything incl. the persons; member: name, payer, contact and bundle only (spec 1.168 §7). */
export type HouseholdEditMode = 'admin' | 'member';

type HouseholdI18nKey = keyof typeof HOUSEHOLD_I18N_KEYS;

/** The messages the `saveHousehold` callable refuses with (permission-denied / invalid-argument). */
const REFUSAL_KEYS: Record<string, HouseholdI18nKey> = {
  'not-allowed':          'error_not_allowed',
  'tenants-changed':      'error_tenants_changed',
  'members-changed':      'error_members_changed',
  'field-not-allowed':    'error_field_not_allowed',
  'no-name':              'error_no_name',
  'payer-not-member':     'error_payer_not_member',
  'contact-not-member':   'error_contact_not_member',
  'duplicate-member':     'error_duplicate_member',
  'already-in-household': 'error_already_in_household',
  'bad-tenants':          'error_bad_tenants',
  'empty-member':         'error_empty_member',
};

/**
 * The i18n key of the toast for an error of `saveHousehold`. A known refusal maps to its own message; anything else
 * (network, internal) to the generic save error.
 */
export function householdErrorKey(error: unknown): HouseholdI18nKey {
  const message = (error as { message?: unknown } | undefined)?.message;
  if (typeof message === 'string' && Object.prototype.hasOwnProperty.call(REFUSAL_KEYS, message)) return REFUSAL_KEYS[message];
  return 'save_error';
}

/** The members a payer or contact may be picked from, with their display names (unknown keys show the key). */
export function memberOptions(memberKeys: string[], personNames: Record<string, string>): { keys: string[]; labels: string[] } {
  return { keys: [...memberKeys], labels: memberKeys.map((k) => personNames[k] || k) };
}

import { PersonModel, PrivacyUsage } from '@okr/shared-models';

/** The display-privacy preference fields (usage*) a person carries. */
export type PrivacyUsageFields = Pick<PersonModel,
  'usageImages' | 'usageDateOfBirth' | 'usagePostalAddress' | 'usageEmail' | 'usagePhone' | 'usageName'>;

/**
 * The model default per usage* field. Firestore reads do NOT apply model defaults, so a person
 * document written before a field existed carries `undefined` — and the two defaults differ:
 * `usageImages` defaults to `Public` (never objected to a picture), everything else to
 * `Restricted`. Coalescing to a single default would report a preference the person never
 * expressed, in either direction.
 */
export const PRIVACY_USAGE_DEFAULTS: Record<keyof PrivacyUsageFields, PrivacyUsage> = {
  usageImages:        PrivacyUsage.Public,
  usageName:          PrivacyUsage.Restricted,
  usageEmail:         PrivacyUsage.Restricted,
  usagePhone:         PrivacyUsage.Restricted,
  usagePostalAddress: PrivacyUsage.Restricted,
  usageDateOfBirth:   PrivacyUsage.Restricted,
};

/** Column order of the privacy overview (2.83) — pictures first, that is the driving case. */
export const PRIVACY_USAGE_FIELDS = Object.keys(PRIVACY_USAGE_DEFAULTS) as (keyof PrivacyUsageFields)[];

/** The effective preference, with the field's own model default applied. */
export function getPrivacyUsage(person: Partial<PrivacyUsageFields> | undefined, field: keyof PrivacyUsageFields): PrivacyUsage {
  return person?.[field] ?? PRIVACY_USAGE_DEFAULTS[field];
}

/**
 * True when the person restricted this channel in any way.
 *
 * ⚠️ Direction: `PrivacyUsage` is `Public = 0 < Restricted = 1 < Protected = 2` — **a higher
 * value is more restrictive**. So this returns the people who do NOT want the datum used, which
 * is what the photographer list asks for. Inverting it here does not produce a display glitch,
 * it produces exactly the privacy incident this feature exists to prevent.
 */
export function isPrivacyRestricted(person: Partial<PrivacyUsageFields> | undefined, field: keyof PrivacyUsageFields): boolean {
  return getPrivacyUsage(person, field) !== PrivacyUsage.Public;
}

/**
 * True when the person changed at least one usage* setting away from its model default —
 * the "Änderungen" work list: who expressed a preference at all.
 */
export function hasPrivacyChanges(person: Partial<PrivacyUsageFields> | undefined): boolean {
  return PRIVACY_USAGE_FIELDS.some((field) => person?.[field] !== undefined && person[field] !== PRIVACY_USAGE_DEFAULTS[field]);
}

/**
 * Mirror the display-privacy preferences (usage*) from a source onto a person and return
 * a new person object. The source is typically the linked UserModel, which still owns the
 * editable usage* fields during the deprecate phase; the person is the read source for
 * AppStore.getPersonPrivacySettings. Missing source values keep the person's current value.
 */
export function mirrorPrivacyUsageToPerson(person: PersonModel, source?: Partial<PrivacyUsageFields>): PersonModel {
  if (!source) return person;
  return {
    ...person,
    usageImages:        source.usageImages        ?? person.usageImages,
    usageDateOfBirth:   source.usageDateOfBirth    ?? person.usageDateOfBirth,
    usagePostalAddress: source.usagePostalAddress  ?? person.usagePostalAddress,
    usageEmail:         source.usageEmail          ?? person.usageEmail,
    usagePhone:         source.usagePhone          ?? person.usagePhone,
    usageName:          source.usageName           ?? person.usageName,
  };
}

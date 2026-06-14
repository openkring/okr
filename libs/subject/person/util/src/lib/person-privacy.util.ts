import { PersonModel } from '@bk2/shared-models';

/** The display-privacy preference fields (usage*) a person carries. */
export type PrivacyUsageFields = Pick<PersonModel,
  'usageImages' | 'usageDateOfBirth' | 'usagePostalAddress' | 'usageEmail' | 'usagePhone' | 'usageName'>;

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

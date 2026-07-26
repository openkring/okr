import { AddressModel, PersonModel } from '@okr/shared-models';
import { getFullName } from '@okr/shared-util-core';

export type EmailEntry = {
  email: string;
  memberKey: string;
  memberName: string;
  lastName: string;
};

/**
 * Builds a sorted list of primary email addresses for the given persons.
 * The email is resolved per person by the caller (address-directory projection or
 * own raw addresses — privacy 1.19 Phase 4); persons resolving to none are excluded.
 */
export function getMainEmailAddresses(persons: PersonModel[], getEmail: (person: PersonModel) => string | undefined): EmailEntry[] {
  return persons
    .map(p => ({
      email: getEmail(p) ?? '',
      memberKey: p.okey ?? '',
      memberName: getFullName(p.firstName, p.lastName),
      lastName: p.lastName ?? '',
    }))
    .filter(e => !!e.email)
    .sort((a, b) => a.lastName.localeCompare(b.lastName));
}

/**
 * Builds a sorted list of cc: email addresses for the given persons from a pre-fetched
 * set of AddressModel records (must be pre-filtered for addressChannel='email' and isCc=true).
 */
export function getCcEmailAddresses(persons: PersonModel[], allCcAddresses: AddressModel[]): EmailEntry[] {
  const parentKeySet = new Set(persons.map(p => `person.${p.okey}`));
  return allCcAddresses
    .filter(a => parentKeySet.has(a.parentKey) && !!a.email)
    .map(a => {
      const person = persons.find(p => `person.${p.okey}` === a.parentKey);
      return {
        email: a.email,
        memberKey: person?.okey ?? '',
        memberName: getFullName(person?.firstName, person?.lastName),
        lastName: person?.lastName ?? '',
      };
    })
    .sort((a, b) => a.lastName.localeCompare(b.lastName));
}

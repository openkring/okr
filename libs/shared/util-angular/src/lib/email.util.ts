import { AddressModel, PersonModel } from '@bk2/shared-models';
import { getFullName } from '@bk2/shared-util-core';

export type EmailEntry = {
  email: string;
  memberKey: string;
  memberName: string;
  lastName: string;
};

/**
 * Builds a sorted list of primary (favEmail) addresses for the given persons.
 * Persons without a favEmail are excluded.
 */
export function getMainEmailAddresses(persons: PersonModel[]): EmailEntry[] {
  return persons
    .filter(p => !!p.favEmail)
    .map(p => ({
      email: p.favEmail!,
      memberKey: p.bkey ?? '',
      memberName: getFullName(p.firstName, p.lastName),
      lastName: p.lastName ?? '',
    }))
    .sort((a, b) => a.lastName.localeCompare(b.lastName));
}

/**
 * Builds a sorted list of cc: email addresses for the given persons from a pre-fetched
 * set of AddressModel records (must be pre-filtered for addressChannel='email' and isCc=true).
 */
export function getCcEmailAddresses(persons: PersonModel[], allCcAddresses: AddressModel[]): EmailEntry[] {
  const parentKeySet = new Set(persons.map(p => `person.${p.bkey}`));
  return allCcAddresses
    .filter(a => parentKeySet.has(a.parentKey) && !!a.email)
    .map(a => {
      const person = persons.find(p => `person.${p.bkey}` === a.parentKey);
      return {
        email: a.email,
        memberKey: person?.bkey ?? '',
        memberName: getFullName(person?.firstName, person?.lastName),
        lastName: person?.lastName ?? '',
      };
    })
    .sort((a, b) => a.lastName.localeCompare(b.lastName));
}

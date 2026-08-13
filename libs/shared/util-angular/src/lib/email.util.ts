import { AddressModel, PersonModel } from '@okr/shared-models';
import { getFullName } from '@okr/shared-util-core';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Splits a free-text field into individual email addresses (comma, semicolon or whitespace
 * separated), lower-cases them and drops anything that is not a plausible address.
 */
export function parseEmailList(raw: string): string[] {
  return raw
    .split(/[,;\s]+/)
    .map(e => e.trim().toLowerCase())
    .filter(e => EMAIL_RE.test(e));
}

/** Appends `raw`'s addresses to `existing`, preserving order and dropping duplicates. */
export function mergeEmailList(existing: string[], raw: string): string[] {
  const seen = new Set(existing.map(e => e.toLowerCase()));
  const added = parseEmailList(raw).filter(e => !seen.has(e) && (seen.add(e), true));
  return [...existing, ...added];
}

/**
 * Splits recipients into blocks for a throttled bulk send. Mailgun accepts at most 1000
 * recipients per message, so a mailing list has to go out in several messages.
 */
export function chunkRecipients(recipients: string[], size: number): string[][] {
  if (size < 1) throw new Error('chunkRecipients: size must be >= 1');
  const chunks: string[][] = [];
  for (let i = 0; i < recipients.length; i += size) {
    chunks.push(recipients.slice(i, i + size));
  }
  return chunks;
}

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

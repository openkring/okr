import { AddressModel, PersonModel } from '@okr/shared-models';
import { fill, ReportAction, ReportFinding } from '@okr/shared-util-core';
import { computeFavoriteAddressInfo } from '@okr/subject-address-util';

/** A person whose cached favorite value differs from the one their favorite address yields. */
export interface FavMismatch {
  personKey: string;
  personName: string;
  field: 'favZipCode';
  cached: string;
  fromAddress: string;
}

/**
 * Already-translated templates for the report. This util is pure and cannot translate, so the caller
 * resolves the i18n keys and passes the strings in. Placeholders use single braces (see `fill`).
 */
export interface FavMismatchTexts {
  /** `{cached}` the value stored on the person, `{fromAddress}` the value of the favorite address */
  detail: string;
  /** shown instead of an empty value */
  noValue: string;
  /** label of the repair action «In Person übernehmen» */
  toPerson: string;
}

/**
 * Compares the favZipCode cache on every person with their favorite postal address.
 * `addresses.parentKey` is `person.<okey>`, never the raw okey. favEmail/favPhone were stripped from
 * persons (spec 1.19 phase 4), so only the zip cache remains to check.
 */
export function findFavMismatches(persons: PersonModel[], addresses: AddressModel[]): FavMismatch[] {
  const mismatches: FavMismatch[] = [];
  for (const person of persons) {
    const personAddresses = addresses.filter(a => a.parentKey === `person.${person.okey}`);
    const fav = computeFavoriteAddressInfo(personAddresses);
    if (person.favZipCode !== fav.favZipCode) {
      mismatches.push({
        personKey: person.okey,
        personName: `${person.firstName} ${person.lastName}`,
        field: 'favZipCode',
        cached: person.favZipCode,
        fromAddress: fav.favZipCode,
      });
    }
  }
  return mismatches;
}

/** One finding per mismatch; a tap opens the person, the action copies the address value into the person. */
export function favMismatchFindings(mismatches: FavMismatch[], texts: FavMismatchTexts): ReportFinding[] {
  const toPerson: ReportAction = { id: 'toPerson', label: texts.toPerson };
  return mismatches.map(m => ({
    id: `${m.personKey}:${m.field}`,
    title: m.personName,
    detail: fill(texts.detail, { cached: m.cached || texts.noValue, fromAddress: m.fromAddress || texts.noValue }),
    url: `/person/${encodeURIComponent(m.personKey)}`,
    actions: [toPerson],
  }));
}

import * as i18nIsoCountries from 'i18n-iso-countries';
import deCountries from 'i18n-iso-countries/langs/de.json';
import enCountries from 'i18n-iso-countries/langs/en.json';
import frCountries from 'i18n-iso-countries/langs/fr.json';
import itCountries from 'i18n-iso-countries/langs/it.json';
import esCountries from 'i18n-iso-countries/langs/es.json';

import { DEFAULT_COUNTRY } from '@okr/shared-constants';
import { createFavoriteAddress } from '@okr/subject-address-util';
import { AddressModel, OrgModel, PersonModel } from '@okr/shared-models';

import { DEFAULT_VCARD_IMPORT_TEXTS, fill, VcardImportTexts } from './vcard-i18n';
import { composeImportNotes } from './vcard-import-notes';
import { vcardDateToStoreDate } from './vcard-import-dates';
import { ParsedVcard } from './vcard-parser';
import { VcardChannel, VcardRelatedName } from './vcard-types';

/*
  i18n-iso-countries ships no locale data by default. A card can come from anywhere:
  our own exporter writes the German display name, but Apple and Google write the one
  the phone's language produced — "Switzerland", "Suisse", "Svizzera", "Suiza". All five
  app languages are therefore registered and all five are tried (§4.2). Registering twice
  (e.g. alongside @okr/shared-util-core, which registers the same five) is a no-op for
  i18n-iso-countries, so this is safe even when both modules load in the same bundle.
*/
for (const locale of [deCountries, enCountries, frCountries, itCountries, esCountries]) {
  i18nIsoCountries.registerLocale(locale as unknown as i18nIsoCountries.LocaleData);
}

/** The languages a `COUNTRY` component is tried in, in order (matches AvailableLanguages). */
const COUNTRY_LOCALES = ['de', 'en', 'fr', 'it', 'es'];

/** The mapped result of `toImportDraft` — unsaved Firestore model drafts, ready for review before commit. */
export interface VcardImportDraft {
  kind: 'person' | 'org';
  person?: PersonModel;
  org?: OrgModel;
  addresses: AddressModel[]; // parentKey empty; filled at commit time
  dob: string; // StoreDate, '' when absent
  dod: string;
  photoBase64?: string;
  notes: string;
  employment?: { orgName: string; department: string; title: string; role: string };
  relatedNames: VcardRelatedName[];
  sourceFileName: string;
  displayName: string;
  warnings: string[];
}

/** vCard TYPE token (upper-cased) -> addressUsage tag (spec §4.2). */
const TYPE_TO_USAGE: Record<string, string> = {
  HOME: 'home',
  WORK: 'work',
  CELL: 'mobile',
  MOBILE: 'mobile',
  IPHONE: 'mobile',
  FAX: 'fax',
};

/**
 * Map a vCard TYPE token to an addressUsage tag actually available on this tenant.
 * An unknown token, a missing token, or a mapped usage the tenant does not carry as
 * a tag all fall back to a known-good default ('home' for persons, 'work' for orgs) —
 * writing a usage key the tenant doesn't have would make the address un-editable in
 * the address form afterwards.
 */
export function mapVcardType(typeToken: string | undefined, isOrgCard: boolean, availableUsages: string[]): { usage: string; matched: boolean } {
  // The FALLBACK is checked against the tenant exactly like a mapped usage would be: a
  // tenant without a 'home' item would otherwise be handed precisely the un-editable
  // address this check exists to prevent. Last resort is the first usage the tenant
  // really has; only an empty tenant category leaves the hard-coded default standing.
  const preferred = isOrgCard ? 'work' : 'home';
  const fallback = availableUsages.includes(preferred) ? preferred : availableUsages[0] ?? preferred;
  if (!typeToken) return { usage: fallback, matched: false };
  const mapped = TYPE_TO_USAGE[typeToken.toUpperCase()];
  if (!mapped || !availableUsages.includes(mapped)) return { usage: fallback, matched: false };
  return { usage: mapped, matched: true };
}

/** Split "<streetName> <streetNumber>" (a trailing token starting with a digit) apart. */
export function splitStreet(street: string | undefined): { streetName: string; streetNumber: string } {
  if (!street) return { streetName: '', streetNumber: '' };
  const match = /^(.*\S)\s+(\d[^\s]*)$/.exec(street.trim());
  if (!match) return { streetName: street.trim(), streetNumber: '' };
  return { streetName: match[1], streetNumber: match[2] };
}

/**
 * Country display name -> ISO 3166-1 alpha-2 code (§4.2).
 *
 * Never returns `''`: `address.validations.ts` makes `countryCode` mandatory, exactly two
 * characters and upper-case, so an empty code writes a postal address that the address
 * form then refuses to save until a human repairs it. An unresolvable name therefore
 * falls back to `DEFAULT_COUNTRY` **and keeps the warning** — the operator is told that a
 * value was substituted, instead of finding a broken record later.
 */
function countryNameToCode(name: string | undefined, warnings: string[], texts: VcardImportTexts): string {
  if (!name) return DEFAULT_COUNTRY;
  for (const locale of COUNTRY_LOCALES) {
    const code = i18nIsoCountries.getAlpha2Code(name, locale);
    if (code) return code.toUpperCase();
  }
  warnings.push(fill(texts.unknownCountry, { name, fallback: DEFAULT_COUNTRY }));
  return DEFAULT_COUNTRY;
}

function mapChannel(ch: VcardChannel, isOrgCard: boolean, tenantId: string, availableUsages: string[], warnings: string[], texts: VcardImportTexts): AddressModel {
  const { usage, matched } = mapVcardType(ch.type, isOrgCard, availableUsages);
  if (!matched && ch.type) {
    warnings.push(fill(texts.unknownUsage, { type: ch.type, channel: ch.channel, usage }));
  }

  let address: AddressModel;
  if (ch.channel === 'postal') {
    const { streetName, streetNumber } = splitStreet(ch.street);
    const countryCode = countryNameToCode(ch.country, warnings, texts);
    // `ext` is the ADR `Ext` component (c/o, apartment, floor) -> addressValue2 (§4.2).
    address = createFavoriteAddress('postal', usage, streetName, tenantId, streetNumber, ch.ext ?? '', ch.zip ?? '', ch.city ?? '', countryCode);
  } else {
    address = createFavoriteAddress(ch.channel, usage, ch.value ?? '', tenantId);
  }

  address.isFavorite = ch.pref === true;
  address.addressChannelLabel = ch.label ?? '';
  return address;
}

/**
 * Map a `ParsedVcard` into unsaved Firestore model drafts (PersonModel/OrgModel plus
 * AddressModel[]), ready for review before the caller commits them (§4.1–§4.4, §4.7).
 * `addresses[].parentKey` is deliberately left empty — it is filled in once the caller
 * knows the (new or matched) person/org okey at commit time.
 */
export function toImportDraft(
  parsed: ParsedVcard,
  tenantId: string,
  availableUsages: string[],
  importDateViewDate: string,
  texts: VcardImportTexts = DEFAULT_VCARD_IMPORT_TEXTS,
): VcardImportDraft {
  const warnings: string[] = [...parsed.warnings];
  const isOrgCard = parsed.kind === 'org';

  let person: PersonModel | undefined;
  let org: OrgModel | undefined;
  if (isOrgCard) {
    org = new OrgModel(tenantId);
    org.name = parsed.orgName ?? parsed.displayName;
  } else {
    person = new PersonModel(tenantId);
    person.firstName = parsed.firstName ?? '';
    person.lastName = parsed.lastName ?? '';
  }

  const addresses = parsed.channels.map((ch) => mapChannel(ch, isOrgCard, tenantId, availableUsages, warnings, texts));

  const extraLines: string[] = [];
  const dob = vcardDateToStoreDate(parsed.bday);
  if (parsed.bday && !dob) {
    extraLines.push(`BDAY: ${parsed.bday}`);
    warnings.push(fill(texts.badDate, { property: 'BDAY', value: parsed.bday }));
  }

  const dod = vcardDateToStoreDate(parsed.deathdate);
  if (parsed.deathdate && !dod) {
    extraLines.push(`DEATHDATE: ${parsed.deathdate}`);
    warnings.push(fill(texts.badDate, { property: 'DEATHDATE', value: parsed.deathdate }));
  }

  const composed = composeImportNotes(parsed, importDateViewDate, extraLines, texts);
  warnings.push(...composed.warnings);

  const employment = parsed.employment
    ? { orgName: parsed.employment.org, department: parsed.employment.department ?? '', title: parsed.employment.title ?? '', role: parsed.employment.role ?? '' }
    : undefined;

  return {
    kind: parsed.kind,
    person,
    org,
    addresses,
    dob,
    dod,
    photoBase64: parsed.photoBase64,
    notes: composed.text,
    employment,
    relatedNames: parsed.relatedNames,
    sourceFileName: parsed.sourceFileName,
    displayName: parsed.displayName,
    warnings,
  };
}

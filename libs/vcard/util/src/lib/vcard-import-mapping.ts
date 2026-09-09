import * as i18nIsoCountries from 'i18n-iso-countries';
import deCountries from 'i18n-iso-countries/langs/de.json';

import { createFavoriteAddress } from '@okr/subject-address-util';
import { AddressModel, OrgModel, PersonModel } from '@okr/shared-models';

import { composeImportNotes } from './vcard-import-notes';
import { vcardDateToStoreDate } from './vcard-import-dates';
import { ParsedVcard } from './vcard-parser';
import { VcardChannel } from './vcard-types';

/*
  i18n-iso-countries ships no locale data by default. The exporter (vcard-generator.ts)
  emits the German display country name (§4.4), so only 'de' needs to be registered here
  to resolve it back to an ISO alpha-2 code. Registering twice (e.g. alongside
  @okr/shared-util-core, which registers all five app languages) is a no-op for
  i18n-iso-countries, so this is safe even when both modules load in the same bundle.
*/
i18nIsoCountries.registerLocale(deCountries as unknown as i18nIsoCountries.LocaleData);

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
  relatedNames: { name: string; label: string }[];
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
  const fallback = isOrgCard ? 'work' : 'home';
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

/** Country display name (as emitted by the exporter, §4.4) -> ISO alpha-2 code, '' when unresolvable. */
function countryNameToCode(name: string | undefined, warnings: string[]): string {
  if (!name) return '';
  const code = i18nIsoCountries.getAlpha2Code(name, 'de');
  if (!code) {
    warnings.push(`Land "${name}" konnte keinem ISO-Code zugeordnet werden.`);
    return '';
  }
  return code;
}

function mapChannel(ch: VcardChannel, isOrgCard: boolean, tenantId: string, availableUsages: string[], warnings: string[]): AddressModel {
  const { usage, matched } = mapVcardType(ch.type, isOrgCard, availableUsages);
  if (!matched && ch.type) {
    warnings.push(`Unbekannter TYPE "${ch.type}" bei ${ch.channel} — auf "${usage}" abgebildet.`);
  }

  let address: AddressModel;
  if (ch.channel === 'postal') {
    const { streetName, streetNumber } = splitStreet(ch.street);
    const countryCode = countryNameToCode(ch.country, warnings);
    address = createFavoriteAddress('postal', usage, streetName, tenantId, streetNumber, '', ch.zip ?? '', ch.city ?? '', countryCode || 'CH');
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
export function toImportDraft(parsed: ParsedVcard, tenantId: string, availableUsages: string[], importDateViewDate: string): VcardImportDraft {
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

  const addresses = parsed.channels.map((ch) => mapChannel(ch, isOrgCard, tenantId, availableUsages, warnings));

  const extraLines: string[] = [];
  const dob = vcardDateToStoreDate(parsed.bday);
  if (parsed.bday && !dob) {
    extraLines.push(`BDAY: ${parsed.bday}   ← kein gültiges Datum`);
    warnings.push(`BDAY "${parsed.bday}" konnte nicht als Datum uebernommen werden.`);
  }

  // DEATHDATE/X-DEATH-DATE are consumed by the parser (never land in `residual`) but
  // ParsedVcard carries no field for them (see Task 2 report §5) — there is nothing to
  // read `dod` from yet, so it always comes out ''.
  const dod = '';

  const composed = composeImportNotes(parsed, importDateViewDate, extraLines);
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

import { classifyStoreDate, convertDateFormatToString, DateFormat } from './date.util';
import { END_FUTURE_DATE_STR } from '@okr/shared-constants';
import { SrvChanges, SrvIndex, SrvMismatch } from '@okr/shared-models';

/**
 * Convert StoreDate "YYYYMMDD" → Regasoft ISO datetime "YYYY-MM-DDTHH:mm:ss". Returns null for
 * empty input AND for a partial date (year-only or birthday-without-year) — Regasoft has no
 * partial-date representation, and converting one would reach format() with an Invalid Date
 * and throw (parseDate only returns null for the end-future sentinel, not for a structurally
 * partial StoreDate).
 */
export function storeDateToRegasoftDate(storeDate: string | undefined): string | null {
  if (!storeDate || storeDate.length < 8) return null;
  if (classifyStoreDate(storeDate.substring(0, 8)) !== 'full') return null;
  const isoDate = convertDateFormatToString(storeDate.substring(0, 8), DateFormat.StoreDate, DateFormat.IsoDate, false);
  return isoDate ? `${isoDate}T00:00:00` : null;
}

/** Convert Regasoft ISO datetime "YYYY-MM-DDTHH:mm:ss" → StoreDate "YYYYMMDD". Returns '' for null. */
export function regasoftDateToStoreDate(isoDateTime: string | null | undefined): string {
  if (!isoDateTime) return '';
  const isoDate = isoDateTime.length > 10 ? isoDateTime.substring(0, 10) : isoDateTime;
  return convertDateFormatToString(isoDate, DateFormat.IsoDate, DateFormat.StoreDate, false);
}

/**
 * Normalise a phone number for comparison: digits only, Swiss `+41` / `0041` → national `0`,
 * a trunk `0` right after the Swiss code dropped (`+41 (0)79…`, `+41 079…`), any other `+CC` → `00CC`.
 * Empty → ''.
 */
export function normalizePhone(n: string): string {
  const trimmed = (n ?? '').trim();
  if (!trimmed) return '';
  // «(0)» after the country code must go before the parentheses are stripped.
  const withoutTrunk = trimmed.replace(/^(\+|00)(\d{1,3})\s*\(0\)/, '$1$2');
  const hasPlus = withoutTrunk.startsWith('+');
  const digits = withoutTrunk.replace(/\D/g, '');
  if (!digits) return '';
  const international = hasPlus ? `00${digits}` : digits;
  if (!international.startsWith('0041')) return international;
  const rest = international.substring(4);
  // A Swiss national number never starts with 0, so a leading 0 here is a written trunk zero.
  return rest.startsWith('0') ? rest : `0${rest}`;
}

/** D4: a normalised number starting `07x` is a mobile, everything else a landline (`telefon`). */
export function classifyPhone(n: string): 'mobile' | 'telefon' {
  return /^07\d/.test(normalizePhone(n)) ? 'mobile' : 'telefon';
}

/** The BK number matches if it equals either Regasoft field; no number on either side is a match. */
export function phonesMatch(bk: string, rMobile: string, rTelefon: string): boolean {
  const b = normalizePhone(bk);
  const m = normalizePhone(rMobile);
  const t = normalizePhone(rTelefon);
  if (!b) return !m && !t;
  return b === m || b === t;
}

/** BK country code → Regasoft country id. Extend from observed records; replace with Regasoft's list (Q3). */
export const REGASOFT_COUNTRY_IDS: Record<string, number> = { CH: 3 };

export function countryIdOf(code: string): number | null {
  return REGASOFT_COUNTRY_IDS[(code ?? '').trim().toUpperCase()] ?? null;
}

/**
 * The Regasoft status dates a member should have (StoreDates, '' = empty). Death wins over
 * exit, exit over passive. An exit counts only as a full date that is not in the future
 * (an announced exit must not drop the member out of Regasoft early) and not the no-exit
 * sentinel. A passive member (category 'P') is inactive since `passiveSince`, else `today` (spec Q4).
 */
export function expectedSrvStatus(s: {
  dateOfDeath: string;
  dateOfExit: string;
  category: string;
  passiveSince: string;
  today: string;
}): { leavingDate: string; dateOfDeath: string; inactiveDate: string } {
  const none = { leavingDate: '', dateOfDeath: '', inactiveDate: '' };
  if (classifyStoreDate(s.dateOfDeath) === 'full') return { ...none, dateOfDeath: s.dateOfDeath };
  if (s.dateOfExit !== END_FUTURE_DATE_STR && classifyStoreDate(s.dateOfExit) === 'full' && s.dateOfExit <= s.today) {
    return { ...none, leavingDate: s.dateOfExit };
  }
  if (s.category === 'P') return { ...none, inactiveDate: s.passiveSince || s.today };
  return none;
}

/**
 * Why a member must not be created in Regasoft (a record there can never be deleted again):
 * `hasSrvNumber` = our parent membership already holds a SRV number but nothing links to a Regasoft
 * record (reactivate the member instead, D8); `duplicate` = another Regasoft entry has the same
 * name and the same full birth date (partial dates never count as a match). `null` = free to create.
 */
export function srvCreateBlocker(item: SrvIndex, index: SrvIndex[]): 'hasSrvNumber' | 'duplicate' | null {
  if (item.memberId && !item.rid) return 'hasSrvNumber';
  if (classifyStoreDate(item.dateOfBirth) !== 'full') return null;
  const duplicate = index.some(
    (other) =>
      other !== item &&
      !!other.rid &&
      other.key === item.key &&
      classifyStoreDate(other.rDateOfBirth) === 'full' &&
      other.rDateOfBirth === item.dateOfBirth
  );
  return duplicate ? 'duplicate' : null;
}

const lower = (s: string) => s.toLowerCase();
const same = (a: string, b: string) => a === b;

/**
 * All BK ↔ Regasoft differences for one index entry, each with a `kind`:
 * `fix` = we hold a value and can write it to Regasoft; `info` = Sekretariat-only, reported;
 * `bk` = our own data is missing or inconsistent. An empty BK value never produces a `fix`
 * (Regasoft data is never cleared from an empty club field) — it is reported as `bk` instead.
 * The status dates follow `expectedSrvStatus`; `leavingDate` / `inactiveDate` may therefore clear a
 * Regasoft value (re-join, active again), but a death date never does (`bk` when only Regasoft has one).
 * `today` is a StoreDate and keeps a future exit date out of Regasoft.
 */
export function getMismatches(item: SrvIndex, today: string): SrvMismatch[] {
  if (!item.rid) return [];

  const result: SrvMismatch[] = [];
  const v = (s: string | undefined | null) => s ?? '';

  const cmp = (field: string, bk: string, r: string, eq: (a: string, b: string) => boolean = same) => {
    if (!bk) {
      if (r) result.push({ field, okrValue: bk, rValue: r, kind: 'bk' });
    } else if (!eq(bk, r)) {
      result.push({ field, okrValue: bk, rValue: r, kind: 'fix' });
    }
  };
  // A partial date (year only, or a birthday without a year) cannot be compared to
  // Regasoft's full date. Reporting it would create a permanent, unresolvable mismatch.
  const cmpFullDate = (field: string, bk: string, r: string) => {
    if (classifyStoreDate(bk) !== 'full' || classifyStoreDate(r) !== 'full') return;
    if (bk !== r) result.push({ field, okrValue: bk, rValue: r, kind: 'fix' });
  };

  cmp('firstName', v(item.firstName), v(item.rFirstName));
  cmp('lastName', v(item.lastName), v(item.rLastName));
  cmp('gender', v(item.gender), v(item.rGender));
  cmpFullDate('dateOfBirth', v(item.dateOfBirth), v(item.rDateOfBirth));
  cmp('email', v(item.mEmail), v(item.rEmail), (a, b) => lower(a) === lower(b));
  cmp('phone', v(item.mPhone), v(item.rMobile) || v(item.rTelefon), (a) => phonesMatch(a, v(item.rMobile), v(item.rTelefon)));
  cmp('street', v(item.mStreet), v(item.rStreet), (a, b) => lower(a) === lower(b));
  cmp('zipCode', v(item.mZipCode), v(item.rZipCode));
  cmp('city', v(item.mCity), v(item.rCity), (a, b) => lower(a) === lower(b));

  const countryId = countryIdOf(v(item.mCountryCode));
  if (countryId !== null && String(countryId) !== v(item.rCountryId)) {
    result.push({ field: 'country', okrValue: item.mCountryCode, rValue: v(item.rCountryId), kind: 'fix' });
  }

  const expected = expectedSrvStatus({
    dateOfDeath: v(item.mDateOfDeath),
    dateOfExit: v(item.mDateOfExit),
    category: v(item.mCategory),
    passiveSince: v(item.mPassiveSince),
    today,
  });
  const status: [keyof typeof expected, string][] = [
    ['leavingDate', v(item.rLeavingDate)],
    ['dateOfDeath', v(item.rDateOfDeath)],
    ['inactiveDate', v(item.rInactiveDate)],
  ];
  for (const [field, r] of status) {
    if (expected[field] === r) continue;
    // Passive without a passiveSince: the expected date is «today», which drifts daily. Any full
    // Regasoft inactiveDate counts as in sync, otherwise the member would stay red and be rewritten every day.
    if (field === 'inactiveDate' && expected.inactiveDate && v(item.mCategory) === 'P' && !v(item.mPassiveSince) && classifyStoreDate(r) === 'full') continue;
    // A death date is never cleared from an empty club field: ask the club to complete its data.
    const kind = field === 'dateOfDeath' && !expected[field] ? 'bk' : 'fix';
    result.push({ field, okrValue: expected[field], rValue: r, kind });
  }

  // Info: Sekretariat-only data, reported only when Regasoft has something to say.
  if (item.hasNewsletter === false) result.push({ field: 'hasNewsletter', okrValue: '', rValue: 'false', kind: 'info' });
  if (item.mainClub === false) result.push({ field: 'mainClub', okrValue: '', rValue: 'false', kind: 'info' });

  // BK-side data.
  if (item.rServiceId && v(item.memberId) !== item.rServiceId) {
    result.push({ field: 'memberId', okrValue: v(item.memberId), rValue: item.rServiceId, kind: 'bk' });
  }
  if (item.pKey) {
    const expectedCat = item.mainClub ? item.rCategory : 'D';
    if (expectedCat && item.pCategory !== expectedCat) {
      result.push({ field: 'pCategory', okrValue: item.pCategory, rValue: expectedCat, kind: 'bk' });
    }
  }

  return result;
}

/** The change set for Regasoft: only the `fix` differences, under Regasoft's field names. */
export function getSrvChanges(item: SrvIndex, today: string): SrvChanges {
  const changes: SrvChanges = {};
  for (const m of getMismatches(item, today)) {
    if (m.kind !== 'fix') continue;
    switch (m.field) {
      case 'gender': changes.gender = item.gender === 'female' ? 2 : 1; break;
      case 'dateOfBirth': changes.birthday = m.okrValue; break;
      case 'zipCode': changes.postcode = m.okrValue; break;
      case 'phone': changes[classifyPhone(item.mPhone)] = m.okrValue; break;
      case 'country': changes.countryId = countryIdOf(item.mCountryCode); break;
      case 'firstName':
      case 'lastName':
      case 'email':
      case 'street':
      case 'city':
      case 'leavingDate':
      case 'dateOfDeath':
      case 'inactiveDate':
        changes[m.field] = m.okrValue;
        break;
    }
  }
  return changes;
}

// ─── Sekretariat report (spec 1.133 §8) ──────────────────────────────────────

/**
 * What the Regasoft API cannot do, the Sekretariat does by hand. `licence` and `delete` are part of
 * the union for later: there is no reliable source for them yet, so `getSekretariatCases` never
 * produces them today.
 */
export type SrvCaseType = 'duplicate' | 'newsletter' | 'licence' | 'mainClub' | 'doubleMembership' | 'delete';

export interface SrvCase {
  /** Stable per case: `${caseType}-${rid}`. Also the id suffix of the `external-reports` mark. */
  caseKey: string;
  caseType: SrvCaseType;
  /** `person.<personKey>` or '' when the Regasoft record has no BK person. */
  subjectKey: string;
  /** The Regasoft record id the case is about. */
  externalRef: string;
  /** One German line for the mail (name, SRV number, what). Built at compose time, never stored. */
  line: string;
}

const SEKRETARIAT_MAIL_INTRO = 'Bitte schaut euch folgende Mitglieder im Regasoft an:';
const SEKRETARIAT_MAIL_CLOSING = 'Vielen Dank und freundliche Grüsse';
/** Longest `mailto:` URL we hand to a mail program; longer ones are cut or refused by some of them. */
const MAILTO_MAX_LENGTH = 1800;

const WHAT: Record<'duplicate' | 'newsletter' | 'mainClub' | 'doubleMembership', (rid: string) => string> = {
  duplicate: rid => `doppelter Eintrag (ID ${rid}), bitte löschen`,
  newsletter: () => 'Newsletter abonniert?',
  mainClub: () => 'Hauptclub prüfen',
  doubleMembership: () => 'Mitglied in mehreren Clubs',
};

function sekretariatCase(item: SrvIndex, caseType: keyof typeof WHAT): SrvCase {
  const name = `${item.firstName || item.rFirstName} ${item.lastName || item.rLastName}`.trim();
  return {
    caseKey: `${caseType}-${item.rid}`,
    caseType,
    subjectKey: item.personKey ? `person.${item.personKey}` : '',
    externalRef: item.rid,
    line: `«${name}, SRV-Nr. ${item.rServiceId || '–'}: ${WHAT[caseType](item.rid)}»`,
  };
}

/**
 * The Regasoft records that are a second entry of the same person (same name, same full Regasoft
 * birth date — a missing or partial date never groups). Per group the surplus ones are returned:
 * every record not linked to our membership (`memberId` = `rServiceId`); when none is linked, every
 * record except the lowest rid.
 */
function surplusRecords(index: SrvIndex[]): Set<SrvIndex> {
  const groups = new Map<string, SrvIndex[]>();
  for (const item of index) {
    if (!item.rid || classifyStoreDate(item.rDateOfBirth) !== 'full') continue;
    const name = `${item.rFirstName} ${item.rLastName}`.trim().toLowerCase();
    const key = `${name}|${item.rDateOfBirth}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const surplus = new Set<SrvIndex>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const linked = group.filter(i => !!i.memberId && i.memberId === i.rServiceId);
    if (linked.length > 0) {
      for (const i of group) if (!linked.includes(i)) surplus.add(i);
    } else {
      const keep = group.reduce((a, b) => (Number(b.rid) < Number(a.rid) ? b : a));
      for (const i of group) if (i !== keep) surplus.add(i);
    }
  }
  return surplus;
}

/**
 * Everything the Sekretariat has to do in Regasoft for us: second entries to delete, a missing
 * newsletter subscription, a main club that is not ours, a member listed in several clubs.
 * A record reported for deletion carries no further cases (it is going away). Index order.
 */
export function getSekretariatCases(index: SrvIndex[]): SrvCase[] {
  const surplus = surplusRecords(index);
  const cases: SrvCase[] = [];
  for (const item of index) {
    if (!item.rid) continue;
    if (surplus.has(item)) {
      cases.push(sekretariatCase(item, 'duplicate'));
      continue;
    }
    if (item.hasNewsletter === false) cases.push(sekretariatCase(item, 'newsletter'));
    if (item.mainClub === false && !!item.mKey) cases.push(sekretariatCase(item, 'mainClub'));
    if ((item.clubs?.length ?? 0) > 1) cases.push(sekretariatCase(item, 'doubleMembership'));
  }
  return cases;
}

/** The mail to the Sekretariat: fixed German copy, one list line per case, no sender name. */
export function composeSekretariatMail(cases: SrvCase[], clubName: string): { subject: string; body: string } {
  const lines = cases.map(c => `- ${c.line}`);
  return {
    subject: `Mitgliedermutationen ${clubName}`,
    body: ['Hallo zusammen', '', SEKRETARIAT_MAIL_INTRO, ...lines, '', SEKRETARIAT_MAIL_CLOSING].join('\n'),
  };
}

/** `mailto:` draft without a recipient; `null` when the encoded URL is longer than 1'800 characters. */
export function mailtoUrl(mail: { subject: string; body: string }): string | null {
  const url = `mailto:?subject=${encodeURIComponent(mail.subject)}&body=${encodeURIComponent(mail.body)}`;
  return url.length > MAILTO_MAX_LENGTH ? null : url;
}

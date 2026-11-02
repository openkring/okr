import { classifyStoreDate, convertDateFormatToString, DateFormat } from './date.util';
import { END_FUTURE_DATE_STR } from '@okr/shared-constants';
import { SrvChanges, SrvCountry, SrvIndex, SrvMismatch } from '@okr/shared-models';

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

/** Fallback when Regasoft's country list (`GET /api/nationIoc`) could not be read. */
export const REGASOFT_COUNTRY_IDS: Record<string, number> = { CH: 3 };

/**
 * BK country code → Regasoft `countryId`, from Regasoft's country list (spec 1.133 C3). An empty
 * list means it could not be read: then only the fallback (CH = 3) is known. `null` = Regasoft does
 * not know the country, or no code.
 */
export function countryIdOf(code: string, countries: readonly SrvCountry[] = []): number | null {
  const c = (code ?? '').trim().toUpperCase();
  if (!c) return null;
  if (countries.length > 0) return countries.find(n => (n.countryCode ?? '').toUpperCase() === c)?.id ?? null;
  return REGASOFT_COUNTRY_IDS[c] ?? null;
}

/**
 * Regasoft's `modified` (`YYYY-MM-DDTHH:mm:ss` with 0–3 fraction digits, no time zone: shown as
 * Regasoft sends it) as `DD.MM.YYYY HH:mm`. '' for anything else (C5).
 */
export function formatRegasoftModified(modified: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):\d{2}(\.\d{1,7})?$/.exec(modified ?? '');
  return m ? `${m[3]}.${m[2]}.${m[1]} ${m[4]}:${m[5]}` : '';
}

/**
 * Regasoft's `membershipType` → our `mcat_srv` abbreviation (spec 1.133 C2). Honorary is `E` there,
 * not its first letter. An unknown type gives '' so nothing is compared or created from it.
 */
export const SRV_MEMBERSHIP_TYPE_CATEGORY: Record<string, string> = {
  Junior: 'J', Active: 'A', Passive: 'P', Honorary: 'E',
};

export function srvCategoryOf(membershipType: string | null | undefined): string {
  return SRV_MEMBERSHIP_TYPE_CATEGORY[membershipType ?? ''] ?? '';
}

/**
 * `passiveSince` as the status rules read it: `set` = a full date not after `today`; `future` = a
 * full date after `today` (not passive yet); `missing` = empty, partial (year only, no year) or the
 * no-exit sentinel — Regasoft takes only full dates, so a partial one could never be written.
 */
function passiveSinceOf(passiveSince: string, today: string): { state: 'set'; date: string } | { state: 'future' | 'missing' } {
  if (passiveSince === END_FUTURE_DATE_STR || classifyStoreDate(passiveSince) !== 'full') return { state: 'missing' };
  return passiveSince <= today ? { state: 'set', date: passiveSince } : { state: 'future' };
}

/**
 * The Regasoft status dates a member should have (StoreDates, '' = empty). Death wins over
 * exit, exit over passive. An exit counts only as a full date that is not in the future
 * (an announced exit must not drop the member out of Regasoft early) and not the no-exit
 * sentinel. A passive member (category 'P') is inactive since `passiveSince` when that is a full
 * date not after `today`; a future one means «not passive yet» (Regasoft would show Passive at
 * once); a partial or missing one falls back to `today` (spec Q4).
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
  if (s.category === 'P') {
    const since = passiveSinceOf(s.passiveSince, s.today);
    if (since.state === 'future') return none;
    return { ...none, inactiveDate: since.state === 'set' ? since.date : s.today };
  }
  return none;
}

/** The fields of a membership that decide which one the SRV index takes for a person. */
export interface SrvMembershipLike {
  memberKey: string;
  dateOfEntry: string;
  dateOfExit: string;
  /** false on a membership a category change has replaced (the chain goes on with a newer one) */
  relIsLast?: boolean;
}

export interface SrvMembershipPick<T extends SrvMembershipLike> {
  membership: T;
  /** the picked membership ended before `today` (no membership of the person is in force) */
  ended: boolean;
}

const entryOf = (m: SrvMembershipLike): string => (m.dateOfEntry ?? '').substring(0, 8);
const exitOf = (m: SrvMembershipLike): string => (m.dateOfExit || END_FUTURE_DATE_STR).substring(0, 8);

/**
 * One membership per person (`memberKey`) for the SRV index, in the order of first appearance: the
 * one in force today (`dateOfEntry <= today <= dateOfExit`, StoreDate string compare, an empty exit
 * is open). A category change entered in advance leaves two memberships; only the one in force
 * counts, so the future category never reaches Regasoft early. When none is in force, the latest
 * end of a category chain (`relIsLast`) is taken: a membership that starts later, or the last one
 * that ended (`ended: true`, so the exit and death dates can still reach Regasoft).
 */
export function pickSrvMemberships<T extends SrvMembershipLike>(memberships: T[], today: string): SrvMembershipPick<T>[] {
  const byPerson = new Map<string, T[]>();
  for (const m of memberships) {
    const list = byPerson.get(m.memberKey);
    if (list) list.push(m);
    else byPerson.set(m.memberKey, [m]);
  }
  const latest = (list: T[]): T =>
    list.reduce((a, b) => (entryOf(b) > entryOf(a) || (entryOf(b) === entryOf(a) && exitOf(b) > exitOf(a)) ? b : a));

  const picks: SrvMembershipPick<T>[] = [];
  for (const list of byPerson.values()) {
    const inForce = list.filter(m => entryOf(m) <= today && today <= exitOf(m));
    if (inForce.length > 0) {
      picks.push({ membership: latest(inForce), ended: false });
      continue;
    }
    const chainEnds = list.filter(m => m.relIsLast !== false);
    const membership = latest(chainEnds.length > 0 ? chainEnds : list);
    picks.push({ membership, ended: exitOf(membership) < today });
  }
  return picks;
}

/** The fields of a Regasoft record the SRV index matches on (`SrvContact` has them). */
export interface SrvMatchRecord {
  srvId: number;
  serviceId?: number;
  firstName: string;
  lastName: string;
  dateOfBirth: string;   // StoreDate
}

/** One of our memberships looking for its Regasoft record. */
export interface SrvMatchQuery {
  /** SRV number stored on our SRV membership, '' / undefined when none */
  memberId?: string;
  firstName: string;
  lastName: string;
  /** full birth date from the vault, '' when unknown */
  dateOfBirth?: string;
  /** the membership ended before today */
  ended: boolean;
}

const nameKeyOf = (first: string, last: string): string => `${first ?? ''} ${last ?? ''}`.trim().toLowerCase();

/**
 * How sure a match is: by SRV number (3), by name and the same full birth date (2), by name only (1).
 * A stronger match is paired first, so a name-only match never takes a record from its real owner.
 */
export type SrvMatchStrength = 1 | 2 | 3;

function srvMatchIndex<T extends SrvMatchRecord>(current: readonly T[], left: readonly T[]) {
  const index = (records: readonly T[]) => {
    const byServiceId = new Map<string, T>();
    const byName = new Map<string, T[]>();
    for (const r of records) {
      if (r.serviceId != null) byServiceId.set(String(r.serviceId), r);
      const key = nameKeyOf(r.firstName, r.lastName);
      const list = byName.get(key);
      if (list) list.push(r);
      else byName.set(key, [r]);
    }
    return { byServiceId, byName };
  };
  const cur = index(current);
  const gone = index(left);

  return (q: SrvMatchQuery): { record: T; strength: SrvMatchStrength } | undefined => {
    const memberId = q.memberId ?? '';
    if (memberId) {
      const bySrv = cur.byServiceId.get(memberId) ?? (q.ended ? undefined : gone.byServiceId.get(memberId));
      if (bySrv) return { record: bySrv, strength: 3 };
    }
    // A record whose SRV number differs from ours belongs to someone else (0b): never by name.
    const fits = (r: T) => !(memberId && r.serviceId != null && String(r.serviceId) !== memberId);
    const dob = q.dateOfBirth ?? '';
    const fullDob = classifyStoreDate(dob) === 'full';
    const key = nameKeyOf(q.firstName, q.lastName);
    const namesakes = (cur.byName.get(key) ?? []).filter(fits);
    const sameDob = fullDob ? namesakes.find(r => r.dateOfBirth === dob) : undefined;
    if (sameDob) return { record: sameDob, strength: 2 };
    if (namesakes.length > 0) return { record: namesakes[0], strength: 1 };
    if (q.ended || !fullDob) return undefined;
    const departed = gone.byName.get(key)?.find(r => r.dateOfBirth === dob && fits(r));
    return departed ? { record: departed, strength: 2 } : undefined;
  };
}

/**
 * Finds the Regasoft record of one of our memberships (spec 1.133 C1). By SRV number first, then by
 * name. A current membership may match a current record or one of a member who left (re-join, D7);
 * an ended membership only a current one, so long-gone members do not fill the index (I1).
 * A record whose SRV number differs from ours is never matched by name (0b). Among current
 * namesakes the one with the same full birth date wins, else the first; a record of a member who
 * left is matched by name only together with the same full birth date, so a namesake who died
 * years ago is not taken for a new member (who could then never be created). `isSrvLinked` still
 * guards every write.
 */
export function makeSrvMatcher<T extends SrvMatchRecord>(current: readonly T[], left: readonly T[]): (q: SrvMatchQuery) => T | undefined {
  const match = srvMatchIndex(current, left);
  return (q) => match(q)?.record;
}

/** One pairing result: the record, or none; `taken` = a record matched but another entry got it. */
export interface SrvPairResult<T> {
  record: T | undefined;
  taken: boolean;
}

/**
 * Pairs our memberships with Regasoft records so that one record never backs two index entries
 * (Task 9 0a): two entries on one record would write opposite change sets. Matching follows
 * `makeSrvMatcher`. Within one `pair` call the current memberships go first, then the ended ones,
 * and within each the stronger matches first (`SrvMatchStrength`), otherwise in the given order;
 * across calls the earlier call wins (main memberships before orphan SRV memberships). A record
 * already taken is given to no one else: an ended membership then gets none (and leaves the
 * index), a current one stays without a record.
 */
export function makeSrvPairer<T extends SrvMatchRecord>(current: readonly T[], left: readonly T[]) {
  const match = srvMatchIndex(current, left);
  const taken = new Set<number>();
  return {
    /** One result per query, in query order. */
    pair(queries: readonly SrvMatchQuery[]): SrvPairResult<T>[] {
      const matches = queries.map(q => match(q));
      const out: SrvPairResult<T>[] = queries.map(() => ({ record: undefined, taken: false }));
      const order = [...queries.keys()].sort((a, b) =>
        Number(queries[a].ended) - Number(queries[b].ended) || (matches[b]?.strength ?? 0) - (matches[a]?.strength ?? 0));
      for (const i of order) {
        const r = matches[i]?.record;
        if (!r) continue;
        if (taken.has(r.srvId)) out[i] = { record: undefined, taken: true };
        else {
          taken.add(r.srvId);
          out[i] = { record: r, taken: false };
        }
      }
      return out;
    },
    /** The records nobody took so far: current ones are listed alone, departed ones feed the duplicate guard. */
    unpaired(): { current: T[]; left: T[] } {
      return { current: current.filter(r => !taken.has(r.srvId)), left: left.filter(r => !taken.has(r.srvId)) };
    },
  };
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

  // From the member list: always comparable.
  cmp('firstName', v(item.firstName), v(item.rFirstName));
  cmp('lastName', v(item.lastName), v(item.rLastName));
  // Regasoft knows only 1 = male and 2 = female: any other club gender is ours to fix, never written (I4).
  const gender = v(item.gender);
  if (gender === 'male' || gender === 'female') cmp('gender', gender, v(item.rGender));
  else if (gender || v(item.rGender)) result.push({ field: 'gender', okrValue: gender, rValue: v(item.rGender), kind: 'bk' });
  cmpFullDate('dateOfBirth', v(item.dateOfBirth), v(item.rDateOfBirth));
  cmp('email', v(item.mEmail), v(item.rEmail), (a, b) => lower(a) === lower(b));

  // Everything below comes only with the member detail: without it the Regasoft side is empty, not
  // known to be empty, so a comparison would report (and write) a false difference (spec 1.133 I2).
  const detail = item.rDetailLoaded === true;
  if (detail) {
    cmp('phone', v(item.mPhone), v(item.rMobile) || v(item.rTelefon), (a) => phonesMatch(a, v(item.rMobile), v(item.rTelefon)));
    cmp('street', v(item.mStreet), v(item.rStreet), (a, b) => lower(a) === lower(b));
    cmp('zipCode', v(item.mZipCode), v(item.rZipCode));
    cmp('city', v(item.mCity), v(item.rCity), (a, b) => lower(a) === lower(b));

    const countryId = v(item.mCountryId);
    if (countryId && countryId !== v(item.rCountryId)) {
      result.push({ field: 'country', okrValue: item.mCountryCode, rValue: v(item.rCountryId), kind: 'fix' });
    }
  }

  const expected = expectedSrvStatus({
    dateOfDeath: v(item.mDateOfDeath),
    dateOfExit: v(item.mDateOfExit),
    category: v(item.mCategory),
    passiveSince: v(item.mPassiveSince),
    today,
  });
  const status: [keyof typeof expected, string][] = detail ? [
    ['leavingDate', v(item.rLeavingDate)],
    ['dateOfDeath', v(item.rDateOfDeath)],
    ['inactiveDate', v(item.rInactiveDate)],
  ] : [];
  for (const [field, r] of status) {
    if (expected[field] === r) continue;
    // Passive without a usable passiveSince (empty, partial): the expected date is «today», which drifts
    // daily. Any full Regasoft inactiveDate counts as in sync, otherwise the member would stay red and be rewritten every day.
    if (field === 'inactiveDate' && expected.inactiveDate && v(item.mCategory) === 'P' && passiveSinceOf(v(item.mPassiveSince), today).state === 'missing' && classifyStoreDate(r) === 'full') continue;
    // A death date is never cleared from an empty club field: ask the club to complete its data.
    const kind = field === 'dateOfDeath' && !expected[field] ? 'bk' : 'fix';
    result.push({ field, okrValue: expected[field], rValue: r, kind });
  }

  // Info: Sekretariat-only data, reported only when Regasoft has something to say.
  if (detail && item.hasNewsletter === false) result.push({ field: 'hasNewsletter', okrValue: '', rValue: 'false', kind: 'info' });
  if (detail && item.mainClub === false) result.push({ field: 'mainClub', okrValue: '', rValue: 'false', kind: 'info' });

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

const normalisedName = (first: string, last: string): string =>
  `${first ?? ''} ${last ?? ''}`.trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * Whether an index entry is safe to WRITE to Regasoft: it holds one of our members (`mKey`) and a
 * Regasoft record (`rid`), and the two are the same person — either by SRV number (`memberId` =
 * `rServiceId`) or by the same name AND the same full birth date. A name match alone is not enough:
 * Regasoft's PUT replaces the whole record and a record can never be deleted, so a wrong link
 * would write one person's data onto another's record. Regasoft-only and parent-only entries are
 * never linked (they carry no club status to write).
 *
 * Never linked (Task 9 0a/0b): an entry whose SRV number differs from the record's — the two
 * numbers point to a duplicate in Regasoft, which only the Sekretariat can resolve — and, when the
 * `index` is given, an entry whose `rid` another club entry holds too: two entries on one record
 * would write opposite change sets.
 */
export function isSrvLinked(item: SrvIndex, index?: readonly SrvIndex[]): boolean {
  if (!item.mKey || !item.rid) return false;
  if (item.memberId && item.rServiceId && item.memberId !== item.rServiceId) return false;
  if (index?.some(other => !!other.mKey && other.mKey !== item.mKey && other.rid === item.rid)) return false;
  if (!!item.memberId && item.memberId === item.rServiceId) return true;
  return (
    normalisedName(item.firstName, item.lastName) === normalisedName(item.rFirstName, item.rLastName) &&
    classifyStoreDate(item.dateOfBirth) === 'full' &&
    item.dateOfBirth === item.rDateOfBirth
  );
}

/**
 * The change set for Regasoft: only the `fix` differences, under Regasoft's field names.
 * Empty for an entry that is not `isSrvLinked` (against `index` when given) — its differences are
 * shown, never written.
 */
export function getSrvChanges(item: SrvIndex, today: string, index?: readonly SrvIndex[]): SrvChanges {
  const changes: SrvChanges = {};
  if (!isSrvLinked(item, index)) return changes;
  for (const m of getMismatches(item, today)) {
    if (m.kind !== 'fix') continue;
    switch (m.field) {
      case 'gender': changes.gender = item.gender === 'female' ? 2 : 1; break;   // a fix row exists only for male/female
      case 'dateOfBirth': changes.birthday = m.okrValue; break;
      case 'zipCode': changes.postcode = m.okrValue; break;
      case 'phone': changes[classifyPhone(item.mPhone)] = m.okrValue; break;
      case 'country': changes.countryId = Number(item.mCountryId); break;
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
 * produces them today. `newsletter` is never produced either: there is no club consent source,
 * so we cannot ask the Sekretariat to subscribe anyone (spec 1.133 I3); it stays in the union for
 * marks already written.
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

const WHAT: Record<'duplicate' | 'mainClub' | 'doubleMembership', (rid: string) => string> = {
  duplicate: rid => `doppelter Eintrag (ID ${rid}), bitte löschen`,
  mainClub: () => 'Hauptclub prüfen',
  doubleMembership: () => 'Doppelmitgliedschaft bei uns erfasst, in Regasoft nicht',
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
 * a record is linked when `memberId` = `rServiceId` or the index matched it to one of our members
 * (`mKey`); a linked record is never surplus (two or more linked ones: our data is ambiguous, none of
 * them is reported). Without any linked record, every record except the lowest rid is surplus.
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
    const linked = group.filter(i => (!!i.memberId && i.memberId === i.rServiceId) || !!i.mKey);
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
 * Everything the Sekretariat has to do in Regasoft for us: second entries to delete, a main club
 * that is not ours (not for a double member: their main club is the other one), a double member of
 * ours that Regasoft lists in one club. A record reported for deletion carries no further cases (it
 * is going away). Each `caseKey` once, index order.
 */
export function getSekretariatCases(index: SrvIndex[]): SrvCase[] {
  const surplus = surplusRecords(index);
  const cases: SrvCase[] = [];
  // Two index entries can point to the same Regasoft record (two members of ours matched by name):
  // a case is about the record, so it is reported once (first entry wins).
  const seen = new Set<string>();
  const add = (c: SrvCase): void => {
    if (seen.has(c.caseKey)) return;
    seen.add(c.caseKey);
    cases.push(c);
  };
  for (const item of index) {
    // Without the member detail the newsletter, clubs and status are unknown: no case (spec 1.133 I2).
    if (!item.rid || item.rDetailLoaded !== true) continue;
    if (surplus.has(item)) {
      add(sekretariatCase(item, 'duplicate'));
      continue;
    }
    const doubleMember = item.mCategory === 'D' || item.pCategory === 'D';
    if (item.mainClub === false && !!item.mKey && !doubleMember) add(sekretariatCase(item, 'mainClub'));
    // Our data says «double member», Regasoft lists at most one club. Members that Regasoft already
    // lists in several clubs are known to the Sekretariat.
    if (doubleMember && (item.clubs?.length ?? 0) <= 1) {
      add(sekretariatCase(item, 'doubleMembership'));
    }
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

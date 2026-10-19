import { MembershipModel } from '@okr/shared-models';
import { fill, getAgeFromBirthYear, getFullName, isOngoing, ReportFinding } from '@okr/shared-util-core';

import { getMembershipCategoryChanges } from './membership.util';

/**
 * Already-translated templates. These utils are pure and cannot translate, so the caller resolves the
 * i18n keys and passes the strings in. Placeholders use single braces (see `fill`).
 */
export interface OldJuniorTexts {
  /** `{birthYear}`, `{age}` */
  detail: string;
  /** shown instead of the detail when the member has no birth year */
  nodob: string;
}

export interface CategoryChangeTexts {
  /** `{date}`, `{oldCategory}`, `{newCategory}` */
  detail: string;
}

/** The member's detail page; the key is encoded because it ends up in a route segment. */
function memberUrl(memberKey: string): string {
  return `/person/${encodeURIComponent(memberKey)}`;
}

/**
 * Juniors of the given org that are older than `age` (or have no known birth year).
 * Reads the year-precision replica `memberBirthYear` (spec 1.19 D-P4-9): never pad a year into a date.
 * The memberships must already be tenant-scoped by the caller's query.
 */
export function oldJuniorFindings(
  memberships: MembershipModel[],
  orgKey: string,
  refYear: number,
  texts: OldJuniorTexts,
  age = 18,
): ReportFinding[] {
  const findings: ReportFinding[] = [];
  for (const m of memberships) {
    if (m.category !== 'junior' || m.orgKey !== orgKey || m.relIsLast !== true) continue;
    // only memberships that are still open: no exit date, or an exit on/after 31 Dec of the reference year.
    // isOngoing alone would drop a junior leaving exactly at year end.
    if (!isOngoing(m.dateOfExit) && m.dateOfExit < `${refYear}1231`) continue;
    const memberAge = getAgeFromBirthYear(m.memberBirthYear, refYear);
    if (memberAge >= 0 && memberAge <= age) continue;
    findings.push({
      id: m.okey,
      title: getFullName(m.memberName1, m.memberName2),
      detail: memberAge < 0 ? texts.nodob : fill(texts.detail, { birthYear: m.memberBirthYear, age: memberAge }),
      url: memberUrl(m.memberKey),
    });
  }
  return findings;
}

/** The distinct exit years (yyyy) of the org's memberships, newest first. Open exits (9999) count too. */
export function exitYears(memberships: MembershipModel[], orgKey: string): string[] {
  const years = new Set<string>();
  for (const m of memberships) {
    if (m.orgKey !== orgKey || !m.dateOfExit || m.dateOfExit.length < 4) continue;
    if (m.dateOfExit.startsWith('9999')) continue;
    years.add(m.dateOfExit.substring(0, 4));
  }
  return [...years].sort((a, b) => b.localeCompare(a));
}

/** Members whose membership category changed in `year` (yyyy): one finding per change. */
export function categoryChangeFindings(
  memberships: MembershipModel[],
  orgKey: string,
  year: string,
  texts: CategoryChangeTexts,
): ReportFinding[] {
  return getMembershipCategoryChanges(memberships, orgKey, parseInt(year, 10)).map(c => ({
    id: `${c.memberKey}:${c.dateOfChange}`,
    title: getFullName(c.memberName1, c.memberName2),
    detail: fill(texts.detail, { date: c.dateOfChange, oldCategory: c.oldCategory, newCategory: c.newCategory }),
    url: memberUrl(c.memberKey),
  }));
}

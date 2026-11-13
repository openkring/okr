import type { PrivacyUsage } from '@okr/shared-models';

/**
 * `PrivacyUsage.Public`. Not imported as a value: the render lib takes only types from
 * `@okr/shared-models` (the spec pins the two in step).
 */
export const PUBLIC_USAGE = 0 as PrivacyUsage;

/** A person of a people section as the website renders it (mapSection's `persons` items). */
export interface PublicPerson {
  key: string;
  firstName: string;
  lastName: string;
  label: string;
  /** Group members only: false when the person's `usageImages` is not Public — the site shows initials. */
  showImage?: boolean;
  /**
   * Role sections only (§13.1): the role's public address (`ResponsibilityModel.email`), emitted by
   * mapSection only when the section's info shows email. Never a personal address.
   */
  email?: string;
}

/** The fields of a `memberships` document the resolver reads. */
export interface GroupMembershipDoc {
  orgKey?: string;
  orgModelType?: string;
  memberKey?: string;
  memberModelType?: string;
  memberName1?: string;
  memberName2?: string;
  tenants?: string[];
  isArchived?: boolean;
  /** StoreDate yyyyMMdd; '' or missing = open */
  dateOfExit?: string;
}

/** The fields of a `persons` document the resolver reads. */
export interface GroupPersonDoc {
  tenants?: string[];
  isArchived?: boolean;
  isDeceased?: boolean;
  usageName?: number;
  usageImages?: number;
}

const STORE_DATE = /^\d{8}$/;

/** True when one of `tenants` is a site tenant. */
export function sharesTenant(tenants: unknown, siteTenants: string[]): boolean {
  return Array.isArray(tenants) && tenants.some((t) => siteTenants.includes(t as string));
}

/** Ended when the exit date is today or earlier (the app's `isAfterDate(dateOfExit, today)`). */
function hasEnded(dateOfExit: unknown, today: string): boolean {
  return typeof dateOfExit === 'string' && STORE_DATE.test(dateOfExit) && dateOfExit <= today;
}

/**
 * The public members of a group for a website people section (spec 1.153 §13), from already-loaded docs:
 * - active person memberships of `groupId` (orgModelType 'group', not archived, not ended, of a site tenant),
 * - whose person is of a site tenant, not archived and has `usageName === Public` — everyone else is
 *   left out silently,
 * - in the app's order (memberName2 ascending, as `MembershipService.list()`), one entry per person,
 * - with the app's names and label (the membership's memberName1/2; membership avatars carry no label),
 * - `showImage` only when `usageImages` is Public (missing = the model default, Public).
 * No email, ever: personal email has the `registered` floor.
 * @param persons person key → person doc (missing = left out)
 * @param today StoreDate (yyyyMMdd) of the publish
 */
export function resolveGroupPeople(
  groupId: string,
  memberships: GroupMembershipDoc[],
  persons: ReadonlyMap<string, GroupPersonDoc>,
  siteTenants: string[],
  today: string,
): PublicPerson[] {
  if (!groupId) return [];
  const active = memberships.filter((m) =>
    m.orgKey === groupId
    && m.orgModelType === 'group'
    && m.memberModelType === 'person'
    && !!m.memberKey
    && m.isArchived !== true
    && sharesTenant(m.tenants, siteTenants)
    && !hasEnded(m.dateOfExit, today));
  // stable: equal memberName2 keep the query order. Code-point order, as Firestore's orderBy.
  const ordered = active
    .map((m, i) => ({ m, i }))
    .sort((a, b) => {
      const x = a.m.memberName2 ?? '';
      const y = b.m.memberName2 ?? '';
      return x < y ? -1 : x > y ? 1 : a.i - b.i;
    })
    .map(({ m }) => m);

  const out: PublicPerson[] = [];
  const seen = new Set<string>();
  for (const m of ordered) {
    const key = m.memberKey as string;
    if (seen.has(key)) continue;
    const person = persons.get(key);
    // a deceased member is not listed as a current member, whatever the membership still says
    if (!person || person.isArchived === true || person.isDeceased === true || !sharesTenant(person.tenants, siteTenants)) continue;
    if (person.usageName !== PUBLIC_USAGE) continue;
    seen.add(key);
    out.push({
      key,
      firstName: m.memberName1 ?? '',
      lastName: m.memberName2 ?? '',
      label: '',
      showImage: person.usageImages === undefined || person.usageImages === PUBLIC_USAGE,
    });
  }
  return out;
}

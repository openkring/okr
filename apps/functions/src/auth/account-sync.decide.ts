// apps/functions/src/auth/account-sync.decide.ts
//
// Pure transition logic for membership-driven account sync
// (planning/specs/2026-08-12-membership-account-sync-design.md).
// No Firestore, no clock, no I/O — tenantId and today are parameters so this
// stays trivially testable.

import { AvatarUsage, DeliveryChannel, NameDisplay, PersonSortCriteria, type UserModel } from '@okr/shared-models';
import { isActiveMembership } from '@okr/shared-util-core';

/** Inlined subset of MembershipModel — same pattern as membership-sync.ts. */
export interface MembershipDoc {
  memberKey: string;
  memberModelType: 'person' | 'org' | 'group';
  orgKey: string;
  orgModelType: 'org' | 'group';
  dateOfExit?: string;
  isArchived?: boolean;
  tenants?: string[];
  // read by the workflow engine (spec 1.35) for the categoryChanged event and the
  // {name} placeholder of a rule's message
  category?: string;
  memberName1?: string;
  memberName2?: string;
  // a category change ends the old membership with relIsLast = false and creates a
  // successor carrying the whole relLog ('20190101:A,20260814:P')
  relIsLast?: boolean;
  relLog?: string;
}

/**
 * The category abbreviations of a relLog, oldest first: '20190101:A,20260814:P' → ['A', 'P'].
 * More than one entry means this membership succeeds an earlier one — i.e. it was created
 * by a category change, not by someone joining.
 */
export function relLogAbbrs(m: MembershipDoc | undefined): string[] {
  return (m?.relLog ?? '')
    .split(',')
    .map((entry) => entry.split(':')[1]?.trim() ?? '')
    .filter((abbr) => abbr.length > 0);
}

export type AccountAction = 'open' | 'close' | 'none';

/**
 * True when this membership is an active person↔default-org membership.
 * The default org is the org whose okey equals the tenant id (app.store.ts:266);
 * the orgModelType check is required because org and group keys can collide.
 */
function qualifies(m: MembershipDoc | undefined, tenantId: string, today: string): boolean {
  if (!m) return false;
  if (m.memberModelType !== 'person') return false;
  if (m.orgModelType !== 'org') return false;
  if (m.orgKey !== tenantId) return false;
  return isActiveMembership(m, today);
}

/**
 * @param before   the membership before the write, undefined on create
 * @param after    the membership after the write, undefined on delete
 * @param tenantId resolved from orgKey via the app-config lookup in account-sync.ts
 * @param today    StoreDate (yyyyMMdd)
 */
export function decideAccountAction(
  before: MembershipDoc | undefined,
  after: MembershipDoc | undefined,
  tenantId: string,
  today: string,
): AccountAction {
  const had = qualifies(before, tenantId, today);
  const has = qualifies(after, tenantId, today);
  // A category change ends the old membership and creates a successor
  // (membership.service.ts:111-122). Closing here would delete the member's user
  // document — and with it their Matrix group memberships — only for the successor's
  // write to re-open the account seconds later under a new uid. relIsLast = false says
  // "superseded", so this is not an exit.
  if (had && !has && after?.relIsLast === false) return 'none';
  if (!had && has) return 'open';
  if (had && !has) return 'close';
  return 'none';
}

/**
 * Subtract n days from a StoreDate (yyyyMMdd) and return a StoreDate.
 * Used for the sweep's catch-up window; UTC throughout, so no DST surprises.
 */
export function shiftDaysBack(storeDate: string, days: number): string {
  const year = Number(storeDate.slice(0, 4));
  const month = Number(storeDate.slice(4, 6));
  const day = Number(storeDate.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - days);
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `${date.getUTCFullYear()}${mm}${dd}`;
}

/** The settings of a new user that the tenant's `app-config` may preset. Never a privacy flag (`usage*`). */
export type UserDefaults = Partial<Pick<UserModel, 'avatarUsage' | 'nameDisplay' | 'personSortCriteria' | 'newsDelivery' | 'invoiceDelivery'>>;

/** The values a tenant may preset, per field: what a user's own settings offer. `NameDisplay.None` is for the people section only. */
const DEFAULT_NUMBERS: Readonly<Record<'avatarUsage' | 'nameDisplay' | 'personSortCriteria', readonly number[]>> = {
  avatarUsage: [AvatarUsage.None, AvatarUsage.GravatarFirst, AvatarUsage.NoGravatar, AvatarUsage.PhotoFirst],
  nameDisplay: [NameDisplay.FirstLast, NameDisplay.LastFirst, NameDisplay.FirstOnly, NameDisplay.LastOnly],
  personSortCriteria: [PersonSortCriteria.Firstname, PersonSortCriteria.Lastname, PersonSortCriteria.Fullname, PersonSortCriteria.DateOfBirth, PersonSortCriteria.Key],
};

const KNOWN_CHANNELS: readonly string[] = Object.values(DeliveryChannel);

/** A non-empty list of known channels, each once; anything else (the old numeric enum of eight live tenants included) is no default. */
function channelsOf(value: unknown): DeliveryChannel[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  if (!value.every((entry) => typeof entry === 'string' && KNOWN_CHANNELS.includes(entry))) return undefined;
  return [...new Set(value as DeliveryChannel[])];
}

/**
 * What a tenant presets for the accounts it opens (spec 1.174 §7.2): the five delivery and display choices of
 * `app-config`, each only when it is usable, so a stale or odd value leaves the class default in place. Pure: the caller
 * reads the document and hands over its data, and `Object.assign`s the result onto the new `UserModel`.
 * Everything else in the config is ignored.
 */
export function userDefaultsFrom(config: Record<string, unknown> | undefined): UserDefaults {
  const out: UserDefaults = {};
  if (!config) return out;
  for (const field of ['avatarUsage', 'nameDisplay', 'personSortCriteria'] as const) {
    const value = config[field];
    if (typeof value === 'number' && DEFAULT_NUMBERS[field].includes(value)) out[field] = value;
  }
  for (const field of ['newsDelivery', 'invoiceDelivery'] as const) {
    const channels = channelsOf(config[field]);
    if (channels) out[field] = channels;
  }
  return out;
}

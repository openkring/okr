import { AddressModel, AllocationDirection } from '@okr/shared-models';

import { TenantConfigMeta } from './tenant-switcher.util';

/**
 * The channels whose transfer to another tenant is a deliberate decision (spec 1.47 §2).
 *
 * Deliberately NOT derived from `CHANNEL_SENSITIVITY_FLOOR`: `dob` has the floor `registered`
 * since the §A2 amendment (D-P4-8), so a floor-based split would file a birthdate under
 * "Kontaktdaten". The floor answers who may see a datum INSIDE a tenant; this list answers
 * whether handing it to ANOTHER tenant needs a conscious click. Two different questions.
 */
export const SENSITIVE_ALLOCATION_CHANNELS: readonly string[] = ['ssn', 'dob', 'dod', 'bankaccount'];

/** One tenant tile in either column. */
export interface AllocationTile {
  readonly tenantId: string;
  readonly label: string;
  readonly logoUrl: string;
  readonly isCurrent: boolean;
  /** False for the acting tenant's own tile — it must not leave the left column (D-TA-4). */
  readonly draggable: boolean;
}

export interface AllocationLists {
  readonly current: AllocationTile[];
  readonly available: AllocationTile[];
}

/** One checkbox row in the confirmation dialog. */
export interface AllocationAddressItem {
  readonly okey: string;
  readonly channel: string;
  readonly value: string;
  readonly isFavorite: boolean;
}

export interface AllocationAddressGroups {
  readonly contact: AllocationAddressItem[];
  readonly sensitive: AllocationAddressItem[];
}

/**
 * One candidate for the new account's `loginEmail` — an email address of the person, plus
 * whether Firebase Auth already knows it.
 *
 * `hasAccount` is the whole reason this type exists. A Firebase identity belongs to exactly
 * one tenant (`UserModel.tenants` — "user has always exactly one tenant"), and
 * `createUser` returns the SAME uid for an email that already exists. So an address whose
 * email already carries an account can never become a second, target-tenant login: the
 * request would silently resolve to the other tenant's user document. Such an address is
 * therefore not offered at all rather than offered and rejected.
 */
export interface AllocationEmailOption {
  readonly okey: string;
  readonly email: string;
  readonly isFavorite: boolean;
  readonly hasAccount: boolean;
}

function toTile(tenantId: string, currentTenantId: string, configs: Map<string, TenantConfigMeta>): AllocationTile {
  const cfg = configs.get(tenantId);
  const isCurrent = tenantId === currentTenantId;
  return {
    tenantId,
    label: cfg?.appName?.trim() || tenantId,
    logoUrl: cfg?.logoUrl ?? '',
    isCurrent,
    draggable: !isCurrent,
  };
}

/**
 * Left column = the person's tenants (own tenant first, then alphabetically by label);
 * right column = every configured tenant the person does not have yet.
 *
 * A person tenant with no `app-config` document still gets a tile, labelled by its id — the
 * document is the naming source, not the membership source, and hiding the tile would hide a
 * membership the admin needs to see.
 */
export function splitTenants(
  personTenants: readonly string[],
  allTenantIds: readonly string[],
  currentTenantId: string,
  configs: Map<string, TenantConfigMeta>,
): AllocationLists {
  const owned = new Set(personTenants.filter((t) => !!t));
  const byLabel = (a: AllocationTile, b: AllocationTile) => a.label.localeCompare(b.label);

  const current = [...owned]
    .map((t) => toTile(t, currentTenantId, configs))
    .sort((a, b) => (a.isCurrent !== b.isCurrent ? (a.isCurrent ? -1 : 1) : byLabel(a, b)));

  const available = allTenantIds
    .filter((t) => !!t && !owned.has(t))
    .map((t) => toTile(t, currentTenantId, configs))
    .sort(byLabel);

  return { current, available };
}

/** The human-readable value of an address, per channel. */
function addressValue(a: AddressModel): string {
  switch (a.addressChannel) {
    case 'email':       return a.email;
    case 'phone':       return a.phone;
    case 'web':         return a.url;
    case 'bankaccount': return a.iban;
    case 'ssn':         return a.ssn;
    case 'dob':         return a.dob;
    case 'dod':         return a.dod;
    case 'postal':      return [a.streetName, a.streetNumber, a.zipCode, a.city].filter(Boolean).join(' ');
    default:            return a.addressChannelLabel || a.addressChannel;
  }
}

/**
 * Blocks 2 and 3 of the confirmation dialog. Archived addresses never travel — they are not
 * part of the person's live vault and `getActiveAddresses` excludes them everywhere else too.
 */
export function groupAddressesForConsent(addresses: readonly AddressModel[]): AllocationAddressGroups {
  const contact: AllocationAddressItem[] = [];
  const sensitive: AllocationAddressItem[] = [];

  for (const a of addresses) {
    if (a.isArchived) continue;
    const item: AllocationAddressItem = {
      okey: a.okey,
      channel: a.addressChannel,
      value: addressValue(a),
      isFavorite: a.isFavorite,
    };
    (SENSITIVE_ALLOCATION_CHANNELS.includes(a.addressChannel) ? sensitive : contact).push(item);
  }
  return { contact, sensitive };
}

/** Whether a tile may be dropped in the given direction. Grants are always fine; only the
 * acting tenant's own tile may never be revoked (D-TA-4). */
export function isDropAllowed(tile: AllocationTile, direction: AllocationDirection): boolean {
  return direction === 'grant' || tile.draggable;
}

/**
 * The person's email addresses as account candidates, favourites first.
 *
 * `takenEmails` comes from `getAllocationEmails` (Firebase Auth is the only authority on
 * which emails already have an account — a `users/{uid}` document may be missing while the
 * Auth account exists, and it is the Auth side that decides whether `createUser` collides).
 * Compared case-insensitively, because Firebase Auth treats addresses that way and an admin
 * who typed `Eva@…` in one tenant would otherwise get a duplicate offered here.
 */
export function buildEmailOptions(
  addresses: readonly AddressModel[],
  takenEmails: readonly string[],
): AllocationEmailOption[] {
  const taken = new Set(takenEmails.map(e => e.trim().toLowerCase()).filter(Boolean));
  return addresses
    .filter(a => !a.isArchived && a.addressChannel === 'email' && !!a.email?.trim())
    .map(a => ({
      okey: a.okey,
      email: a.email.trim(),
      isFavorite: a.isFavorite,
      hasAccount: taken.has(a.email.trim().toLowerCase()),
    }))
    .sort((a, b) => (a.isFavorite !== b.isFavorite ? (a.isFavorite ? -1 : 1) : a.email.localeCompare(b.email)));
}

/**
 * The email addresses that could become the login of a new account: the ones the admin has
 * ticked for transfer AND that no account uses yet.
 *
 * Ticked, not merely present: the target tenant must actually receive the address it is
 * supposed to log in with. An account whose `loginEmail` names an address the target tenant
 * never got would be a login the tenant cannot see, support, or correct.
 */
export function eligibleLoginEmails(
  selectedAddressKeys: readonly string[],
  options: readonly AllocationEmailOption[],
): AllocationEmailOption[] {
  const selected = new Set(selectedAddressKeys);
  return options.filter(o => selected.has(o.okey) && !o.hasAccount);
}

/**
 * Keep the admin's pick while it stays eligible, otherwise fall back to the first candidate
 * (favourite first, by the ordering of `buildEmailOptions`). Unticking the chosen address
 * must not leave a stale `loginEmail` pointing at an address that is no longer travelling.
 */
export function resolveLoginEmail(chosen: string, eligible: readonly AllocationEmailOption[]): string {
  if (eligible.length === 0) return '';
  return eligible.some(o => o.email === chosen) ? chosen : eligible[0].email;
}

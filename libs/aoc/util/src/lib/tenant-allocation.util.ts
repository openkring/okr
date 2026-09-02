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

/**
 * Shared types for the vCard export feature (spec 17).
 *
 * These types are intentionally decoupled from the Firestore models: the Cloud
 * Function assembles a {@link VcardRecord} from PersonModel/OrgModel/AddressModel/
 * WorkrelModel/PersonalRelModel and the generator consumes only this shape, so the
 * generator stays pure and trivially testable.
 */

/** vCard-relevant channel kinds (a subset of AddressModel.addressChannel). */
export type VcardChannelType = 'phone' | 'email' | 'postal' | 'web';

/** Target of an export. */
export type VcardTargetKind = 'person' | 'org';

/**
 * What categories of data the operator chose to export. `identity` is always on.
 * For tier 1 (registered) this is forced to favorites-only server-side.
 */
export interface ExportScope {
  identity: true;
  /** which channel kinds to include */
  addresses: VcardChannelType[];
  birthday: boolean;
  photo: boolean;
  /** person: employers · org: linked persons */
  workRels: boolean;
  personalRels: boolean;
  /** orgs only: parent/child organizations (currently omitted) */
  orgLinks: boolean;
}

/**
 * Which categories actually have data for a given target. Drives the scope modal:
 * a toggle is shown only where the value is present/non-empty.
 */
export interface ScopeAvailability {
  addresses: VcardChannelType[];
  birthday: boolean;
  photo: boolean;
  workRels: boolean;
  personalRels: boolean;
  orgLinks: boolean;
}

/** Result of capability resolution (spec §4). */
export interface VcardCapability {
  allowed: boolean;
  /** 0 (none), 1 (single), or 100 (memberAdmin cap) */
  maxTargets: number;
  scope: 'favorites' | 'full';
  /** show the scope-selection modal? */
  promptForScope: boolean;
}

/** One contact channel, pre-composed for emission. */
export interface VcardChannel {
  channel: VcardChannelType;
  /** vCard TYPE token derived from usage, e.g. 'WORK' | 'HOME' | 'CELL'. */
  type?: string;
  /** favorite → adds the PREF token. */
  pref?: boolean;
  /** phone / email / web value */
  value?: string;
  /** postal: "<street> <number>" */
  street?: string;
  city?: string;
  region?: string;
  zip?: string;
  /** postal: display country name (not the ISO code) */
  country?: string;
  /** custom label for web/other channels (item-grouped X-ABLabel) */
  label?: string;
}

/** Native employment block (first WorkRel of a person). */
export interface VcardEmployment {
  org: string;
  department?: string;
  title?: string;
  role?: string;
}

/** An item-grouped related name (PersonalRel, extra employer, org-linked person). */
export interface VcardRelatedName {
  name: string;
  /** Apple predefined token (e.g. `_$!<Spouse>!$_`) or a plain custom label. */
  label: string;
}

/** The fully assembled, model-decoupled input to {@link buildVCard}. */
export interface VcardRecord {
  kind: VcardTargetKind;

  // identity
  firstName?: string;
  lastName?: string;
  displayName: string;
  /** org cards only */
  orgName?: string;
  /** ISO date YYYY-MM-DD */
  bday?: string;
  /** base64-encoded JPEG bytes (no data: prefix) */
  photoBase64?: string;

  // data
  channels: VcardChannel[];
  /** person card: native ORG/TITLE/ROLE from the first WorkRel */
  employment?: VcardEmployment;
  /** PersonalRels + extra employers + (org card) linked persons */
  relatedNames: VcardRelatedName[];
}

/** Callable request payload. */
export interface VcardExportRequest {
  tenantId: string;
  /** 1 for tiers 1/2, ≤ 100 for tier 3 */
  targetIds: string[];
  targetKind: VcardTargetKind;
  scope: ExportScope;
}

/** Callable response payload. */
export interface VcardExportResponse {
  filename: string;
  /** inline payload (small exports) */
  vcardBase64?: string;
  /** signed Storage URL (large exports) */
  downloadUrl?: string;
  recordCount: number;
}

/** The hard cap for a single multi-record (tier 3) export. */
export const VCARD_MAX_TARGETS = 100;

/** Inline-vs-Storage threshold in bytes (~6 MB, spec §7). */
export const VCARD_INLINE_LIMIT_BYTES = 6_000_000;

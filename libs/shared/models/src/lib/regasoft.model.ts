// ─── Regasoft API types ───────────────────────────────────────────────────────

export interface Club {
  clubId: number;
  clubName: string;
  mainClub: boolean;
  personId?: number;
  personFullname?: string | null;
}

/** Raw member shape returned by the Regasoft REST API. */
export interface RegasoftMember {
  id: number;
  fullname?: string;
  firstName: string;
  lastName: string;
  email: string | null;
  mobile: string | null;
  serviceId?: number;
  birthday: string | null;           // ISO datetime "YYYY-MM-DDTHH:mm:ss"
  gender: number;                    // 1=male, 2=female
  hasNewsletter?: boolean;
  hasLicense?: boolean;
  licenseValidUntil?: string | null;
  licenseId?: number | null;
  licenseImage?: string | null;
  licenseImageName?: string | null;
  licenseImageMimeType?: string | null;
  mainClub?: boolean;
  modified?: string | null;
  membershipType?: string;
  nationIOC?: string | null;
  language?: number;
  salutation?: string | null;
  street?: string | null;
  streetAdditional?: string | null;
  countryName?: string | null;
  countryId?: number | null;
  postcode?: string | null;
  city?: string | null;
  telefon?: string | null;
  /** Set = passive member since this date. */
  inactiveDate?: string | null;
  dateOfDeath?: string | null;
  leavingDate?: string | null;
  entryDate?: string | null;
  personClubs?: Club[];
}

/** Normalised contact shape returned by the getSrvContacts / getSrvMemberDetail CFs. */
export interface SrvContact {
  srvId: number;
  serviceId?: number;
  firstName: string;
  lastName: string;
  email: string | null;
  mobile: string | null;
  telefon: string | null;
  dateOfBirth: string;        // StoreDate YYYYMMDD
  gender: number;             // 1=male, 2=female
  membershipType?: string | null;
  nationIOC?: string | null;
  hasNewsletter: boolean;
  mainClub: boolean;
  hasLicense: boolean;
  licenseId?: number | null;
  licenseValidUntil?: string; // StoreDate YYYYMMDD
  leavingDate?: string;       // StoreDate YYYYMMDD
  dateOfDeath?: string;       // StoreDate YYYYMMDD
  street?: string | null;
  postcode?: string | null;
  city?: string | null;
  clubs: Club[];
}

/** Payload shape for createSrvContact / updateSrvContact CFs. */
export interface SrvContactData {
  srvId?: number;
  firstName: string;
  lastName: string;
  fullname?: string;
  email: string | null;
  mobile: string | null;
  dateOfBirth: string;       // StoreDate YYYYMMDD
  gender: number;            // 1=male, 2=female
  membershipType?: string;   // 'Active' | 'Passive'
  nationIOC?: string;
  language?: number;
  hasNewsletter?: boolean;
  hasLicense?: boolean;
  street?: string | null;
  streetAdditional?: string | null;
  postcode?: string | null;
  city?: string | null;
  countryName?: string | null;
  countryId?: string | null;
  telefon?: string | null;
  dateOfDeath?: string | null;   // StoreDate YYYYMMDD
  leavingDate?: string | null;   // StoreDate YYYYMMDD
}

/** Shape returned by the getSrvMemberDetail CF. */
export interface SrvMemberLicenseDetail {
  rid: number;
  hasNewsletter: boolean;
  street: string;
  postcode: string;
  city: string;
  gender: number;                 // 1=male, 2=female
  salutation: string;
  streetAdditional: string;
  countryId: number | null;
  telefon: string;
  mobile: string;
  email: string;
  licenseId: string;
  licenseValidUntil: string;      // StoreDate YYYYMMDD
  licenseImage: string | null;
  licenseImageName: string | null;
  licenseImageMimeType: string | null;
  entryDate: string;              // StoreDate YYYYMMDD
  inactiveDate: string;           // StoreDate YYYYMMDD
  dateOfDeath: string;            // StoreDate YYYYMMDD
  leavingDate: string;            // StoreDate YYYYMMDD
  clubs: Club[];
}

// ─── AoC SRV index types ──────────────────────────────────────────────────────

/** Merged BK + Regasoft index entry used by MembershipSrvStore. */
export interface SrvIndex {
  key: string;       // getFullName(firstName, lastName).trim().toLowerCase()
  firstName: string;
  lastName: string;

  // Main membership (m prefix) — orgKey = tenantId
  mKey: string;        // m.okey
  personKey: string;   // m.memberKey
  mDateOfExit: string; // StoreDate
  dateOfBirth: string; // StoreDate
  gender: string;      // 'male' | 'female'
  state: string;       // m.state
  mCategory: string;   // abbreviated category
  mEmail: string;
  mPhone: string;
  mStreet: string;
  mZipCode: string;
  mCity: string;
  mCountryCode: string;   // ISO country code of the BK postal address
  mDateOfDeath: string;   // StoreDate
  mPassiveSince: string;  // StoreDate

  // Parent membership (p prefix) — orgKey = 'srv'
  pKey: string;        // p.okey
  memberId: string;    // p.memberId = SRV serviceId stored in BK
  pDateOfExit: string; // StoreDate
  pState: string;
  pCategory: string;   // abbreviated category

  // Search index field: 'f:firstname l:lastname s:serviceId r:rid'
  indexField: string;

  // Regasoft (r prefix)
  rid: string;           // r.srvId as string
  rServiceId: string;    // r.serviceId as string
  rFirstName: string;
  rLastName: string;
  rEmail: string;
  rGender: string;       // 'male' | 'female' | ''
  rMobile: string;
  rTelefon: string;
  rStreet: string;
  rZipCode: string;
  rCity: string;
  rCountryId: string;
  rDateOfBirth: string;  // r.dateOfBirth (StoreDate)
  rCategory: string;     // first uppercase char of membershipType
  rDateOfExit: string;   // r.leavingDate || r.dateOfDeath (StoreDate) — display only
  rLeavingDate: string;  // StoreDate
  rDateOfDeath: string;  // StoreDate
  rInactiveDate: string; // StoreDate
  rEntryDate: string;    // StoreDate
  nationIOC: string;
  hasNewsletter: boolean;
  mainClub: boolean;
  clubs: string[];
  licenseId: string;
  licenseValidUntil: string;      // StoreDate
  licenseImage: string | null;
  licenseImageName: string | null;
  licenseImageMimeType: string | null;
}

/**
 * fix  = writable to Regasoft;
 * info = Sekretariat-only (reported, not writable);
 * bk   = to be fixed in our own data (`memberId`, `pCategory`).
 */
export type SrvMismatchKind = 'fix' | 'info' | 'bk';

export interface SrvMismatch {
  field: string;
  okrValue: string;
  rValue: string;
  kind: SrvMismatchKind;
}

/** The 16 member fields Regasoft accepts on a PUT. */
export const SRV_WRITABLE_FIELDS = [
  'firstName', 'lastName', 'gender', 'birthday', 'salutation', 'email', 'countryId', 'city',
  'postcode', 'street', 'streetAdditional', 'telefon', 'mobile', 'dateOfDeath', 'leavingDate', 'inactiveDate',
] as const;

export type SrvWritableField = (typeof SRV_WRITABLE_FIELDS)[number];

/** Changes to write to Regasoft; dates as StoreDate, `''` / `null` = clear the field. */
export type SrvChanges = Partial<Record<SrvWritableField, string | number | null>>;

/** Result of an update: the record before and after, and which fields Regasoft took or ignored. */
export interface SrvUpdateResult {
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  written: SrvWritableField[];
  ignored: SrvWritableField[];
}

/** Dry-run of an update: nothing is sent. */
export interface SrvPreview {
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  payload: Record<string, unknown>;
}

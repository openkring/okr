// ─── Regasoft API types ───────────────────────────────────────────────────────

export interface Club {
  clubId: number;
  clubName: string;
  mainClub: boolean;
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
  licenseDate?: string | null;
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
  inactive?: boolean;
  inactiveDate?: string | null;
  dateOfDeath?: string | null;
  leavingDate?: string | null;
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
  licenseDate?: string;       // StoreDate YYYYMMDD
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
  licenseId: string;
  licenseDate: string;            // StoreDate YYYYMMDD
  licenseValidUntil: string;      // StoreDate YYYYMMDD
  licenseImage: string | null;
  licenseImageName: string | null;
  licenseImageMimeType: string | null;
  inactiveDate: string;           // StoreDate YYYYMMDD
  dateOfDeath: string;            // StoreDate YYYYMMDD
  leavingDate: string;            // StoreDate YYYYMMDD
  clubs: Club[];
}

// ─── AoC SRV index types ──────────────────────────────────────────────────────

/** Merged BK + Regasoft index entry used by AocSrvStore. */
export interface SrvIndex {
  key: string;       // getFullName(firstName, lastName).trim().toLowerCase()
  firstName: string;
  lastName: string;

  // Main membership (m prefix) — orgKey = tenantId
  mKey: string;        // m.bkey
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

  // Parent membership (p prefix) — orgKey = 'srv'
  pKey: string;        // p.bkey
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
  rPhone: string;        // r.mobile || r.telefon
  rStreet: string;
  rZipCode: string;
  rCity: string;
  rDateOfBirth: string;  // r.dateOfBirth (StoreDate)
  rCategory: string;     // first uppercase char of membershipType
  rDateOfExit: string;   // r.leavingDate || r.dateOfDeath (StoreDate)
  nationIOC: string;
  hasNewsletter: boolean;
  mainClub: boolean;
  clubs: string[];
  licenseId: string;
  licenseDate: string;            // StoreDate
  licenseValidUntil: string;      // StoreDate
  licenseImage: string | null;
  licenseImageName: string | null;
  licenseImageMimeType: string | null;
}

export interface SrvMismatch {
  field: string;
  bkValue: string;
  rValue: string;
}

import { defineSecret } from 'firebase-functions/params';

export const regasoftApiKey = defineSecret('REGASOFT_APIKEY');
export const regasoftClubId = defineSecret('REGASOFT_CLUBID');

export const REGASOFT_BASE = 'https://regasoft.swissrowing.ch/PortalTest';

export interface PersonClub {
  clubId: number;
  clubName: string;
  mainClub: boolean;
}

export interface RegasoftMember {
  id: number;
  fullname?: string;
  firstName: string;
  lastName: string;
  email: string | null;
  mobile: string | null;
  serviceId?: number;
  birthday: string | null;       // ISO datetime "YYYY-MM-DDTHH:mm:ss"
  gender: number;                // 1=male, 2=female
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
  personClubs?: PersonClub[];
}

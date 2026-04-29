import { defineSecret } from 'firebase-functions/params';

export { Club, RegasoftMember } from '@bk2/shared-models';

export const regasoftApiKey = defineSecret('REGASOFT_APIKEY');
export const regasoftClubId = defineSecret('REGASOFT_CLUBID');

export const REGASOFT_BASE = 'https://regasoft.swissrowing.ch/PortalTest';

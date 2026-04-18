import { defineSecret } from 'firebase-functions/params';

export const bexioApiKey = defineSecret('BEXIO_APIKEY');
export const bexioUserId = defineSecret('BEXIO_USER_ID');
export const bexioTenantId = defineSecret('BEXIO_TENANT_ID');
export const bexioDefaultTaxId = defineSecret('BEXIO_DEFAULT_TAX_ID');

export const BEXIO_BASE = 'https://api.bexio.com/2.0';
export const BEXIO_BASE_V3 = 'https://api.bexio.com/3.0';
export const BEXIO_BASE_V4 = 'https://api.bexio.com/4.0';

/** Convert Bexio date "YYYY-MM-DD" to StoreDate "YYYYMMDD". Returns '' for null/empty. */
export function toStoreDate(bexioDate: string | null | undefined): string {
  if (!bexioDate) return '';
  const date = bexioDate.length > 10 ? bexioDate.substring(0, 10) : bexioDate;
  return date.replace(/-/g, '');
}

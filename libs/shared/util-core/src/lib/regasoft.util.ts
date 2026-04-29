import { convertDateFormatToString, DateFormat } from './date.util';
import { SrvIndex, SrvMismatch } from '@bk2/shared-models';

/** Convert StoreDate "YYYYMMDD" → Regasoft ISO datetime "YYYY-MM-DDTHH:mm:ss". Returns null for empty. */
export function storeDateToRegasoftDate(storeDate: string | undefined): string | null {
  if (!storeDate || storeDate.length < 8) return null;
  const isoDate = convertDateFormatToString(storeDate.substring(0, 8), DateFormat.StoreDate, DateFormat.IsoDate, false);
  return isoDate ? `${isoDate}T00:00:00` : null;
}

/** Convert Regasoft ISO datetime "YYYY-MM-DDTHH:mm:ss" → StoreDate "YYYYMMDD". Returns '' for null. */
export function regasoftDateToStoreDate(isoDateTime: string | null | undefined): string {
  if (!isoDateTime) return '';
  const isoDate = isoDateTime.length > 10 ? isoDateTime.substring(0, 10) : isoDateTime;
  return convertDateFormatToString(isoDate, DateFormat.IsoDate, DateFormat.StoreDate, false);
}

/** Return all BK ↔ Regasoft field mismatches for a single index entry. */
export function getMismatches(item: SrvIndex): SrvMismatch[] {
  if (!item.rid) return [];

  const result: SrvMismatch[] = [];

  const chk = (field: string, bk: string, r: string) => {
    if (r && bk !== r) result.push({ field, bkValue: bk, rValue: r });
  };
  const chkPhone = (field: string, bk: string, r: string) => {
    const norm = (s: string) => s.replace(/\s/g, '');
    if (r && norm(bk) !== norm(r)) result.push({ field, bkValue: bk, rValue: r });
  };
  const chkCI = (field: string, bk: string, r: string) => {
    if (r && bk.toLowerCase() !== r.toLowerCase()) result.push({ field, bkValue: bk, rValue: r });
  };

  chk('firstName',   item.firstName,   item.rFirstName);
  chk('lastName',    item.lastName,    item.rLastName);
  chk('memberId',    item.memberId,    item.rServiceId);
  chk('email',       item.mEmail,      item.rEmail);
  chkPhone('phone',  item.mPhone,      item.rPhone);
  chkCI('street',    item.mStreet,     item.rStreet);
  chk('zipCode',     item.mZipCode,    item.rZipCode);
  chkCI('city',      item.mCity,       item.rCity);
  chk('dateOfBirth', item.dateOfBirth, item.rDateOfBirth);

  if (item.pKey) {
    const expectedCat = item.mainClub ? item.rCategory : 'D';
    if (expectedCat && item.pCategory !== expectedCat) {
      result.push({ field: 'pCategory', bkValue: item.pCategory, rValue: expectedCat });
    }
  }

  return result;
}

import { describe, expect, it } from 'vitest';
import { bookingVoucherKey, bookingVoucherPath, bookingVoucherRefusal, isUploadId, validateBookingVoucherRequest } from './booking-voucher.util';

describe('validateBookingVoucherRequest', () => {
  const ok = { accountingTenantId: ' gss ', bookingKey: 'b1', fileName: 'Quittung.pdf' };

  it('trims and derives the content type from the extension', () => {
    expect(validateBookingVoucherRequest(ok)).toEqual({ accountingTenantId: 'gss', bookingKey: 'b1', fileName: 'Quittung.pdf', contentType: 'application/pdf' });
    expect(validateBookingVoucherRequest({ ...ok, fileName: 'IMG_1.HEIC' }).contentType).toBe('image/heic');
  });

  it('refuses missing fields, a path in the key and non-Beleg files', () => {
    expect(() => validateBookingVoucherRequest({ ...ok, accountingTenantId: '' })).toThrow();
    expect(() => validateBookingVoucherRequest({ ...ok, bookingKey: 'a/b' })).toThrow();
    expect(() => validateBookingVoucherRequest({ ...ok, fileName: '' })).toThrow();
    expect(() => validateBookingVoucherRequest({ ...ok, fileName: 'page.html' })).toThrow();
    expect(() => validateBookingVoucherRequest(undefined)).toThrow();
  });
});

describe('isUploadId', () => {
  it('accepts 12 lowercase hex chars only', () => {
    expect(isUploadId('0123456789ab')).toBe(true);
    expect(isUploadId('0123456789AB')).toBe(false);
    expect(isUploadId('../x')).toBe(false);
    expect(isUploadId(undefined)).toBe(false);
  });
});

describe('bookingVoucherPath / bookingVoucherKey', () => {
  it('places the file under the booking, with a sanitized name', () => {
    expect(bookingVoucherPath('scs', 'b1', '0123456789ab', 'Rechnung März.pdf')).toBe('tenant/scs/finance/booking/b1/0123456789ab-Rechnung-Marz.pdf');
    expect(bookingVoucherKey('b1', '0123456789ab')).toBe('booking-b1-0123456789ab');
  });
});

describe('bookingVoucherRefusal', () => {
  const booking = { tenants: ['scs'], accountingTenantId: 'gss' };
  it('allows the caller tenant on the named books', () => {
    expect(bookingVoucherRefusal(booking, 'scs', 'gss')).toBe('');
  });
  it('refuses a missing booking, another tenant or other books', () => {
    expect(bookingVoucherRefusal(undefined, 'scs', 'gss')).toBe('booking-not-found');
    expect(bookingVoucherRefusal(booking, 'kring', 'gss')).toBe('booking-not-found');
    expect(bookingVoucherRefusal(booking, 'scs', 'scs')).toBe('booking-not-found');
  });
});

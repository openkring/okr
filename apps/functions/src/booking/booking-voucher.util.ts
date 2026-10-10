import { HttpsError } from 'firebase-functions/v2/https';
import { getMimeType, sanitizeFileName } from '@okr/shared-util-core';

/** Same 25 MB as the default bucket's `sizeOk()` (storage.rules). */
export const MAX_BOOKING_VOUCHER_BYTES = 25 * 1024 * 1024;
/** What a Beleg may be: a PDF or a photo/scan (spec 1.74 thumbnails cover all of them). */
export const BOOKING_VOUCHER_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp'];
const UPLOAD_ID = /^[a-f0-9]{12}$/;

export interface BookingVoucherRequest {
  accountingTenantId: string;
  bookingKey: string;
  fileName: string;
}

/** The request of both callables, trimmed; refuses a missing field or a file that is not a Beleg. */
export function validateBookingVoucherRequest(data: unknown): BookingVoucherRequest & { contentType: string } {
  const d = (data ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const accountingTenantId = str(d['accountingTenantId']);
  const bookingKey = str(d['bookingKey']);
  const fileName = str(d['fileName']);
  if (!accountingTenantId) throw new HttpsError('invalid-argument', 'accountingTenantId is required');
  if (!bookingKey || bookingKey.includes('/')) throw new HttpsError('invalid-argument', 'bookingKey is required');
  if (!fileName) throw new HttpsError('invalid-argument', 'fileName is required');
  // by extension, never by the browser's File.type (empty for HEIC in Chrome/Firefox)
  const contentType = getMimeType(fileName);
  if (!BOOKING_VOUCHER_MIME_TYPES.includes(contentType)) {
    throw new HttpsError('invalid-argument', `file type not allowed: ${fileName}`, { reason: 'voucher-type' });
  }
  return { accountingTenantId, bookingKey, fileName, contentType };
}

export function isUploadId(uploadId: unknown): uploadId is string {
  return typeof uploadId === 'string' && UPLOAD_ID.test(uploadId);
}

/** Where a booking's Beleg sits in the private bucket; the upload id keeps two files of one name apart. */
export function bookingVoucherPath(tenantId: string, bookingKey: string, uploadId: string, fileName: string): string {
  return `tenant/${tenantId}/finance/booking/${bookingKey}/${uploadId}-${sanitizeFileName(fileName)}`;
}

/** The finance-documents okey of a Beleg added to a booking. Deterministic: a retried attach writes the same doc. */
export function bookingVoucherKey(bookingKey: string, uploadId: string): string {
  return `booking-${bookingKey}-${uploadId}`;
}

/**
 * '' when the caller may add a Beleg to this booking; otherwise the refusal reason. The booking must
 * belong to the caller's tenant AND to the books the caller names — never derived from the tenant.
 */
export function bookingVoucherRefusal(booking: Record<string, unknown> | undefined, tenantId: string, accountingTenantId: string): string {
  if (!booking) return 'booking-not-found';
  if (!((booking['tenants'] as string[] | undefined) ?? []).includes(tenantId)) return 'booking-not-found';
  if (booking['accountingTenantId'] !== accountingTenantId) return 'booking-not-found';
  return '';
}

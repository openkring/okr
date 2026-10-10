import { randomBytes } from 'node:crypto';
import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { FieldValue, Firestore, getFirestore } from 'firebase-admin/firestore';

import { FinanceDocumentCollection } from '@okr/shared-models';
import { checkAppCheckToken, checkAuthentication, checkRoles, getCallerTenantId } from '@okr/shared-util-functions';
import { DateFormat, getTodayStr } from '@okr/shared-util-core';

import { privateBucket } from '../_storage/private-bucket';
import { isBexioBackend } from '../bexio/backend-gate';
import {
  BookingVoucherRequest, bookingVoucherKey, bookingVoucherPath, bookingVoucherRefusal, isUploadId, MAX_BOOKING_VOUCHER_BYTES, validateBookingVoucherRequest,
} from './booking-voucher.util';

const REGION = 'europe-west6';
const PREPARE_CF_NAME = 'prepareBookingVoucherUpload';
const ATTACH_CF_NAME = 'attachBookingVoucher';
const BOOKING_COLLECTION = 'bookings';
const UPLOAD_WINDOW_MS = 15 * 60 * 1000;

export interface BookingVoucherUpload {
  uploadId: string;
  uploadUrl: string;
  contentType: string;
  maxBytes: number;
}

/**
 * The checks both callables share: the books belong to the caller's tenant and are kept natively
 * (a bexio ledger is a read-only cache), and the booking belongs to those books.
 */
async function assertBookingOfBooks(db: Firestore, cfName: string, tenantId: string, req: BookingVoucherRequest): Promise<void> {
  const config = (await db.collection('accounting-configs').doc(req.accountingTenantId).get()).data();
  if (!config || !((config['tenants'] as string[] | undefined) ?? []).includes(tenantId)) {
    throw new HttpsError('not-found', 'unknown books');
  }
  if (isBexioBackend(config as { accountingBackend?: string })) {
    throw new HttpsError('failed-precondition', 'the books are managed externally', { reason: 'external-books' });
  }
  const booking = (await db.collection(BOOKING_COLLECTION).doc(req.bookingKey).get()).data();
  const refusal = bookingVoucherRefusal(booking, tenantId, req.accountingTenantId);
  if (refusal) {
    logger.warn(`${cfName}: refused ${req.bookingKey} (${refusal}) for tenant ${tenantId}`);
    throw new HttpsError('not-found', `booking ${req.bookingKey} not found`, { reason: refusal });
  }
}

/**
 * Step 1 of adding a Beleg to a booking: a signed v4 PUT URL into the private bucket (spec 1.74 —
 * vouchers never touch the imgix-readable default bucket). Nothing is written yet, so an upload that
 * never happens leaves nothing behind. The client uploads with exactly `Content-Type: <contentType>`
 * and `x-goog-content-length-range: 0,<maxBytes>`, then calls `attachBookingVoucher`.
 */
export const prepareBookingVoucherUpload = onCall(
  { region: REGION, enforceAppCheck: true, cors: true },
  async (request: CallableRequest<unknown>): Promise<BookingVoucherUpload> => {
    checkAppCheckToken(request as never, PREPARE_CF_NAME);
    checkAuthentication(request as never, PREPARE_CF_NAME);
    await checkRoles(request as never, PREPARE_CF_NAME, ['treasurer']);
    const tenantId = await getCallerTenantId(request as never, PREPARE_CF_NAME);
    const req = validateBookingVoucherRequest(request.data);
    await assertBookingOfBooks(getFirestore(), PREPARE_CF_NAME, tenantId, req);

    const uploadId = randomBytes(6).toString('hex');
    const [uploadUrl] = await privateBucket().file(bookingVoucherPath(tenantId, req.bookingKey, uploadId, req.fileName)).getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + UPLOAD_WINDOW_MS,
      contentType: req.contentType,
      extensionHeaders: { 'x-goog-content-length-range': `0,${MAX_BOOKING_VOUCHER_BYTES}` },
    });
    return { uploadId, uploadUrl, contentType: req.contentType, maxBytes: MAX_BOOKING_VOUCHER_BYTES };
  },
);

/**
 * Step 2: the uploaded file becomes a Beleg — `finance-documents/booking-{bookingKey}-{uploadId}` and
 * appended to `booking.documentKeys` (never `documentKey`: writeBooking writes that one from the
 * client's copy). Retry-safe: the document key is deterministic and the append is an arrayUnion.
 */
export const attachBookingVoucher = onCall(
  { region: REGION, enforceAppCheck: true, cors: true },
  async (request: CallableRequest<unknown>): Promise<{ documentKey: string }> => {
    checkAppCheckToken(request as never, ATTACH_CF_NAME);
    checkAuthentication(request as never, ATTACH_CF_NAME);
    await checkRoles(request as never, ATTACH_CF_NAME, ['treasurer']);
    const tenantId = await getCallerTenantId(request as never, ATTACH_CF_NAME);
    const req = validateBookingVoucherRequest(request.data);
    const uploadId = (request.data as { uploadId?: unknown } | undefined)?.uploadId;
    if (!isUploadId(uploadId)) throw new HttpsError('invalid-argument', 'uploadId is required');
    const db = getFirestore();
    await assertBookingOfBooks(db, ATTACH_CF_NAME, tenantId, req);

    const fullPath = bookingVoucherPath(tenantId, req.bookingKey, uploadId, req.fileName);
    const file = privateBucket().file(fullPath);
    const [exists] = await file.exists();
    if (!exists) throw new HttpsError('failed-precondition', 'the file was not uploaded', { reason: 'voucher-not-uploaded' });
    const [meta] = await file.getMetadata();

    const documentKey = bookingVoucherKey(req.bookingKey, uploadId);
    const name = req.fileName;
    const today = getTodayStr(DateFormat.StoreDate);
    // same field set as the bill vouchers (bill/bill-voucher.ts attachBillScan) and the bexio-migrated ones
    await db.collection(FinanceDocumentCollection).doc(documentKey).set({
      tenants: [tenantId], accountingTenantId: req.accountingTenantId, isArchived: false,
      index: `n:${name}`, tags: 'booking-voucher', folderKeys: [], fullPath, description: '', title: name,
      altText: name, type: 'finance', source: 'storage', credit: '', url: '',
      mimeType: String(meta.contentType ?? req.contentType), size: Number(meta.size ?? 0),
      authorKey: request.auth?.uid ?? '', authorName: '', dateOfDocCreation: today, dateOfDocLastUpdate: today, locationKey: '',
      hash: '', priorVersionKey: '', version: '', renderings: [],
    });
    await db.collection(BOOKING_COLLECTION).doc(req.bookingKey).update({ documentKeys: FieldValue.arrayUnion(documentKey) });
    logger.info(`${ATTACH_CF_NAME}: ${documentKey} attached to booking ${req.bookingKey} (tenant=${tenantId}, books=${req.accountingTenantId})`);
    return { documentKey };
  },
);

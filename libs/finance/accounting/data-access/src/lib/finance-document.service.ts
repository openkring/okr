import { Injectable } from '@angular/core';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';

import { Voucher } from '@okr/finance-accounting-util';

const REGION = 'europe-west6';

/** The signed upload `prepareBookingVoucherUpload` hands out (spec 1.74: vouchers go straight to the private bucket). */
interface BookingVoucherUpload { uploadId: string; uploadUrl: string; contentType: string; maxBytes: number; }

/**
 * Vouchers (Belege) live in the private bucket (spec 1.74) — the client never reads them directly.
 * `signFinanceDocuments` checks the role and returns short-lived signed links (~10 min).
 */
@Injectable({ providedIn: 'root' })
export class FinanceDocumentService {
  public async sign(documentKeys: string[]): Promise<Voucher[]> {
    const keys = documentKeys.filter(Boolean);
    if (keys.length === 0) return [];
    const fn = httpsCallable<{ documentKeys: string[] }, { vouchers: Voucher[] }>(getFunctions(getApp(), REGION), 'signFinanceDocuments');
    const result = await fn({ documentKeys: keys });
    // keep the caller's order (the first key is the booking's primary voucher)
    return keys.map(k => result.data.vouchers.find(v => v.key === k)).filter((v): v is Voucher => !!v);
  }

  /**
   * Adds a file as Beleg to a booking: a signed PUT into the private bucket, then `attachBookingVoucher`
   * writes the finance-document and appends it to `booking.documentKeys`.
   * @param accountingTenantId the booking's books (never the app tenant)
   * @returns the new finance-documents okey
   */
  public async addBookingVoucher(accountingTenantId: string, bookingKey: string, file: File): Promise<string> {
    const functions = getFunctions(getApp(), REGION);
    const request = { accountingTenantId, bookingKey, fileName: file.name };
    const prepare = httpsCallable<typeof request, BookingVoucherUpload>(functions, 'prepareBookingVoucherUpload');
    const { data } = await prepare(request);
    await this.putSignedUpload(data, file);
    const attach = httpsCallable<typeof request & { uploadId: string }, { documentKey: string }>(functions, 'attachBookingVoucher');
    return (await attach({ ...request, uploadId: data.uploadId })).data.documentKey;
  }

  /**
   * PUT to a v4-signed URL. Both headers are part of the signature: any other Content-Type, or a
   * missing content-length-range, and GCS answers 403. The URL is a write credential — never logged.
   */
  private async putSignedUpload(upload: BookingVoucherUpload, file: File): Promise<void> {
    const response = await fetch(upload.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': upload.contentType, 'x-goog-content-length-range': `0,${upload.maxBytes}` },
      body: file,
    });
    if (!response.ok) throw new Error(`FinanceDocumentService: voucher upload failed (${response.status})`);
  }
}

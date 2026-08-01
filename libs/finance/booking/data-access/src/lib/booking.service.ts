import { inject, Injectable } from '@angular/core';
import { firstValueFrom, Observable } from 'rxjs';
import { getApp } from 'firebase/app';
import { doc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { AvatarInfo, BookingCollection, BookingLineModel, BookingModel, BookingStatus, UserModel } from '@okr/shared-models';
import { findByKey, getSystemQuery } from '@okr/shared-util-core';

import { validateBookingBalance } from '@okr/finance-booking-util';

import { BookingLineService } from './booking-line.service';

/** One corrected booking line sent to `reviewBooking` (amounts in minor units). */
export interface ReviewBookingLine {
  accountKey: string;
  debitAmount?: { amount: number; currency: string } | null;
  creditAmount?: { amount: number; currency: string } | null;
}

/** Payload of the `reviewBooking` callable. `corrections` applies to 'approve' only. */
export interface ReviewBookingPayload {
  bookingKey: string;
  decision: 'approve' | 'reject';
  reason?: string;
  corrections?: {
    title?: string;
    date?: string;
    counterparty?: AvatarInfo | null;
    lines?: ReviewBookingLine[];
  };
}

export interface ReviewBookingResult {
  bookingNo: number;
  status: BookingStatus;
}

@Injectable({ providedIn: 'root' })
export class BookingService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly bookingLineService = inject(BookingLineService);
  private readonly tenantId = this.env.tenantId;

  public async create(
    booking: BookingModel,
    lines: BookingLineModel[],
    currentUser?: UserModel
  ): Promise<string | undefined> {
    if (!validateBookingBalance(lines)) {
      console.error('BookingService.create: booking lines are not balanced');
      return undefined;
    }
    const batch = this.firestoreService.getBatch();
    const okey = booking.okey?.length > 0 ? booking.okey : crypto.randomUUID();
    const { okey: _okey, ...headerData } = { ...booking, okey } as BookingModel & { okey: string };
    const headerRef = doc(this.firestoreService.firestore, BookingCollection, okey);
    batch.set(headerRef, headerData);
    this.bookingLineService.addLinesToBatch(lines, batch);
    await batch.commit();
    return okey;
  }

  public read(key: string, accountingTenantId: string): Observable<BookingModel | undefined> {
    return findByKey<BookingModel>(this.list(accountingTenantId), key);
  }

  public async update(booking: BookingModel, lines: BookingLineModel[], currentUser?: UserModel): Promise<void> {
    if (!validateBookingBalance(lines)) {
      console.error('BookingService.update: booking lines are not balanced');
      return;
    }
    const okey = booking.okey;
    const oldLines = await firstValueFrom(this.bookingLineService.listForBooking(okey, booking.accountingTenantId));
    const batch = this.firestoreService.getBatch();
    this.bookingLineService.deleteLinesToBatch(oldLines, batch);
    const { okey: _okey, ...headerData } = { ...booking } as BookingModel & { okey: string };
    const headerRef = doc(this.firestoreService.firestore, BookingCollection, okey);
    batch.set(headerRef, headerData, { merge: false });
    this.bookingLineService.addLinesToBatch(lines, batch);
    await batch.commit();
  }

  public async delete(booking: BookingModel, currentUser?: UserModel): Promise<void> {
    const okey = booking.okey;
    const lines = await firstValueFrom(this.bookingLineService.listForBooking(okey, booking.accountingTenantId));
    const batch = this.firestoreService.getBatch();
    this.bookingLineService.deleteLinesToBatch(lines, batch);
    const headerRef = doc(this.firestoreService.firestore, BookingCollection, okey);
    batch.delete(headerRef);
    await batch.commit();
  }

  public list(accountingTenantId: string, orderBy = 'date', sortOrder = 'desc'): Observable<BookingModel[]> {
    const query = [
      ...getSystemQuery(this.tenantId),
      { key: 'accountingTenantId', operator: '==' as const, value: accountingTenantId },
    ];
    return this.firestoreService.searchData<BookingModel>(BookingCollection, query, orderBy, sortOrder);
  }

  /** One-shot, consistent read (no cache-first race). Promise counterpart to {@link list}. */
  public listOnce(accountingTenantId: string, orderBy = 'date', sortOrder = 'desc'): Promise<BookingModel[]> {
    const query = [
      ...getSystemQuery(this.tenantId),
      { key: 'accountingTenantId', operator: '==' as const, value: accountingTenantId },
    ];
    return this.firestoreService.getDataOnce<BookingModel>(BookingCollection, query, orderBy, sortOrder);
  }

  /**
   * Treasurer decision on a `forReview` booking (spec 1.20).
   *
   * `bookings` / `booking-lines` are CF-write-only, so this goes through the `reviewBooking`
   * callable. The CF assigns `bookingNo` inside its transaction — do NOT pre-compute it with
   * {@link nextSequence} here, that races a concurrent approval. `tenantId` is derived
   * server-side from the caller and is deliberately not part of the payload.
   */
  public async reviewViaFunction(payload: ReviewBookingPayload): Promise<ReviewBookingResult> {
    const fn = httpsCallable(getFunctions(getApp(), 'europe-west6'), 'reviewBooking');
    const result = await fn(payload);
    return result.data as ReviewBookingResult;
  }

  public async nextSequence(year: number, accountingTenantId: string): Promise<number> {
    const bookings = await this.listOnce(accountingTenantId);
    const yearStr = String(year);
    const maxNo = bookings
      .filter(b => b.date?.startsWith(yearStr))
      .map(b => b.bookingNo ?? 0)
      .reduce((max, n) => Math.max(max, n), 0);
    return maxNo + 1;
  }
}

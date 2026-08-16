import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { AvatarInfo, BookingCollection, BookingLineModel, BookingModel, BookingStatus, UserModel } from '@okr/shared-models';
import { findByKey, getSystemQuery } from '@okr/shared-util-core';

import { validateBookingBalance } from '@okr/finance-booking-util';

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

/** Payload of the `writeBooking` callable (manual journal entries). */
export interface WriteBookingPayload {
  mode: 'create' | 'update' | 'delete';
  bookingKey?: string;
  accountingTenantId?: string;
  booking?: Record<string, unknown>;
  lines?: Record<string, unknown>[];
}

/** Header fields the CF accepts; the rest (status, bookingNo, tenants, …) is server-owned. */
function toHeaderPayload(booking: BookingModel): Record<string, unknown> {
  return {
    title: booking.title,
    date: booking.date,
    notes: booking.notes,
    periodKey: booking.periodKey,
    documentKey: booking.documentKey,
    counterparty: booking.counterparty ?? null,
    tags: booking.tags,
    index: booking.index,
  };
}

/** A booking line stripped to what the CF stores (plain JSON — a class instance is not sendable). */
function toWriteLine(line: BookingLineModel): Record<string, unknown> {
  return {
    accountKey: line.accountKey,
    debitAmount: line.debitAmount ? { amount: line.debitAmount.amount, currency: line.debitAmount.currency } : null,
    creditAmount: line.creditAmount ? { amount: line.creditAmount.amount, currency: line.creditAmount.currency } : null,
    amountFx: line.amountFx ? { amount: line.amountFx.amount, currency: line.amountFx.currency } : null,
    exchangeRateKey: line.exchangeRateKey,
    vatCodeKey: line.vatCodeKey,
  };
}

@Injectable({ providedIn: 'root' })
export class BookingService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
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
    const result = await this.writeViaFunction({
      mode: 'create',
      accountingTenantId: booking.accountingTenantId,
      booking: toHeaderPayload(booking),
      lines: lines.map(toWriteLine),
    });
    return result.bookingKey;
  }

  public read(key: string, accountingTenantId: string): Observable<BookingModel | undefined> {
    return findByKey<BookingModel>(this.list(accountingTenantId), key);
  }

  public async update(booking: BookingModel, lines: BookingLineModel[], currentUser?: UserModel): Promise<void> {
    if (!validateBookingBalance(lines)) {
      console.error('BookingService.update: booking lines are not balanced');
      return;
    }
    await this.writeViaFunction({
      mode: 'update',
      bookingKey: booking.okey,
      booking: toHeaderPayload(booking),
      lines: lines.map(toWriteLine),
    });
  }

  public async delete(booking: BookingModel, currentUser?: UserModel): Promise<void> {
    await this.writeViaFunction({ mode: 'delete', bookingKey: booking.okey });
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

  /**
   * Manual journal entry (create/update/delete) via the `writeBooking` callable — `bookings` /
   * `booking-lines` are CF-write-only, a client batch write fails permission-denied.
   * The CF owns `bookingNo`, `status` and `tenants`; a `forReview` booking is rejected here and
   * must go through {@link reviewViaFunction}.
   */
  public async writeViaFunction(payload: WriteBookingPayload): Promise<{ bookingKey: string; bookingNo: number }> {
    const fn = httpsCallable(getFunctions(getApp(), 'europe-west6'), 'writeBooking');
    const result = await fn(payload);
    return result.data as { bookingKey: string; bookingNo: number };
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

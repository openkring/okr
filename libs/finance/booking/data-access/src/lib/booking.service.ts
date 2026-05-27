import { inject, Injectable } from '@angular/core';
import { firstValueFrom, Observable } from 'rxjs';
import { doc } from 'firebase/firestore';

import { ENV } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { BookingCollection, BookingLineModel, BookingModel, UserModel } from '@bk2/shared-models';
import { findByKey, getSystemQuery } from '@bk2/shared-util-core';
import { validateBookingBalance } from '@bk2/finance-booking-util';

import { BookingLineService } from './booking-line.service';

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
    const bkey = booking.bkey?.length > 0 ? booking.bkey : crypto.randomUUID();
    const { bkey: _bkey, ...headerData } = { ...booking, bkey } as BookingModel & { bkey: string };
    const headerRef = doc(this.firestoreService.firestore, BookingCollection, bkey);
    batch.set(headerRef, headerData);
    this.bookingLineService.addLinesToBatch(lines, batch);
    await batch.commit();
    return bkey;
  }

  public read(key: string, accountingTenantId: string): Observable<BookingModel | undefined> {
    return findByKey<BookingModel>(this.list(accountingTenantId), key);
  }

  public async update(booking: BookingModel, lines: BookingLineModel[], currentUser?: UserModel): Promise<void> {
    if (!validateBookingBalance(lines)) {
      console.error('BookingService.update: booking lines are not balanced');
      return;
    }
    const bkey = booking.bkey;
    const oldLines = await firstValueFrom(this.bookingLineService.listForBooking(bkey, booking.accountingTenantId));
    const batch = this.firestoreService.getBatch();
    this.bookingLineService.deleteLinesToBatch(oldLines, batch);
    const { bkey: _bkey, ...headerData } = { ...booking } as BookingModel & { bkey: string };
    const headerRef = doc(this.firestoreService.firestore, BookingCollection, bkey);
    batch.set(headerRef, headerData, { merge: false });
    this.bookingLineService.addLinesToBatch(lines, batch);
    await batch.commit();
  }

  public async delete(booking: BookingModel, currentUser?: UserModel): Promise<void> {
    const bkey = booking.bkey;
    const lines = await firstValueFrom(this.bookingLineService.listForBooking(bkey, booking.accountingTenantId));
    const batch = this.firestoreService.getBatch();
    this.bookingLineService.deleteLinesToBatch(lines, batch);
    const headerRef = doc(this.firestoreService.firestore, BookingCollection, bkey);
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

  public async nextSequence(year: number, accountingTenantId: string): Promise<number> {
    const bookings = await firstValueFrom(this.list(accountingTenantId));
    const yearStr = String(year);
    const maxNo = bookings
      .filter(b => b.date?.startsWith(yearStr))
      .map(b => b.bookingNo ?? 0)
      .reduce((max, n) => Math.max(max, n), 0);
    return maxNo + 1;
  }
}

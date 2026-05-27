import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { doc, WriteBatch } from 'firebase/firestore';

import { ENV } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { BookingLineCollection, BookingLineModel } from '@bk2/shared-models';
import { getSystemQuery } from '@bk2/shared-util-core';

@Injectable({ providedIn: 'root' })
export class BookingLineService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly tenantId = this.env.tenantId;

  public listForBooking(bookingKey: string, accountingTenantId: string): Observable<BookingLineModel[]> {
    const query = [
      ...getSystemQuery(this.tenantId),
      { key: 'bookingKey', operator: '==' as const, value: bookingKey },
      { key: 'accountingTenantId', operator: '==' as const, value: accountingTenantId },
    ];
    return this.firestoreService.searchData<BookingLineModel>(BookingLineCollection, query, 'none');
  }

  public addLinesToBatch(lines: BookingLineModel[], batch: WriteBatch): void {
    for (const line of lines) {
      const { bkey, ...data } = line as BookingLineModel & { bkey: string };
      const ref = doc(this.firestoreService.firestore, BookingLineCollection, bkey);
      batch.set(ref, data, { merge: false });
    }
  }

  public deleteLinesToBatch(lines: BookingLineModel[], batch: WriteBatch): void {
    for (const line of lines) {
      const ref = doc(this.firestoreService.firestore, BookingLineCollection, (line as BookingLineModel & { bkey: string }).bkey);
      batch.delete(ref);
    }
  }
}

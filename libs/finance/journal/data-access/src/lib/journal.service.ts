import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ENV } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { BookingJournalModel, JournalCollection } from '@bk2/shared-models';
import { getSystemQuery } from '@bk2/shared-util-core';

@Injectable({
  providedIn: 'root'
})
export class JournalService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);

  public list(): Observable<BookingJournalModel[]> {
    return this.firestoreService.searchData<BookingJournalModel>(
      JournalCollection,
      getSystemQuery(this.env.tenantId),
      'date',
      'desc'
    );
  }
}

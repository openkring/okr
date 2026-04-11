import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ENV } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { BillCollection, BillModel } from '@bk2/shared-models';
import { getSystemQuery } from '@bk2/shared-util-core';

@Injectable({
  providedIn: 'root'
})
export class BillService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);

  public list(): Observable<BillModel[]> {
    return this.firestoreService.searchData<BillModel>(
      BillCollection,
      getSystemQuery(this.env.tenantId),
      'billDate',
      'desc'
    );
  }
}

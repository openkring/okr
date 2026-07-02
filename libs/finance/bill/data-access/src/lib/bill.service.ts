import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { BillCollection, BillModel } from '@okr/shared-models';
import { getSystemQuery } from '@okr/shared-util-core';

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

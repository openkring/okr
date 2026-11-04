import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { FirestoreService } from '@okr/shared-data-access';
import { EnergyFiguresCollection, EnergyFiguresModel } from '@okr/shared-models';

/**
 * Read-only access to the `energy-figures` collection.
 *
 * The documents are written by the nightly energy-figures job (Admin SDK); the Firestore rules
 * deny client writes, which is why this service has no create/update/delete.
 */
@Injectable({ providedIn: 'root' })
export class EnergyFiguresService {
  private readonly firestoreService = inject(FirestoreService);

  /**
   * The figures of one municipality, as a live listener. Emits undefined while the document does
   * not exist (job not run yet, or no data for this municipality).
   *
   * Read by id (`String(bfsNr)` is the document key), not by query: a `tenants` + `in` query would
   * need a composite index, and the rules already scope the read to the caller's tenants.
   */
  public read(bfsNr: number): Observable<EnergyFiguresModel | undefined> {
    return this.firestoreService.readModel<EnergyFiguresModel>(EnergyFiguresCollection, String(bfsNr));
  }
}

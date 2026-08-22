import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { AliasCollection, AliasModel, AliasSpaceModel } from '@okr/shared-models';
import { getSystemQuery } from '@okr/shared-util-core';
import { buildAliasDocId } from '@okr/system-alias-util';

/**
 * Aliase (planning/specs/2026-08-22-alias-service-spec.md).
 *
 * LESEND über Firestore. Geprägt wird ausschliesslich serverseitig über die Callables
 * `createAlias` / `resolveAlias` (Teilprojekt 2) — nicht aus Bequemlichkeit, sondern weil
 * `FirestoreService.createModel()` mit setDoc() arbeitet und einen bestehenden Alias unter
 * derselben deterministischen ID stillschweigend ÜBERSCHREIBEN würde. Nur `.create()` des
 * Admin SDK wirft bei Kollision, und ein still überschriebener Alias führt eine gedruckte
 * Auflage ins Leere.
 */
@Injectable({ providedIn: 'root' })
export class AliasService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly tenantId = this.env.tenantId;

  public list(space?: string, orderBy = 'alias', sortOrder: 'asc' | 'desc' = 'asc'): Observable<AliasModel[]> {
    const query = getSystemQuery(this.tenantId);
    if (space) query.push({ key: 'space', operator: '==', value: space });
    return this.firestoreService.searchData<AliasModel>(AliasCollection, query, orderBy, sortOrder);
  }

  public read(key: string): Observable<AliasModel | undefined> {
    return this.firestoreService.readModel<AliasModel>(AliasCollection, key);
  }

  /**
   * Der Kern des Features: (space, alias) → Alias-Dokument, in einem einzigen getDoc.
   * Das ist der Weg, den ein `lookup`-Space geht (Diary: 'Barbara' → person.<okey>).
   */
  public resolve(space: AliasSpaceModel, alias: string): Observable<AliasModel | undefined> {
    const docId = buildAliasDocId(this.tenantId, space.name, alias, space.caseSensitive);
    return this.firestoreService.readModel<AliasModel>(AliasCollection, docId);
  }

  /** Reverse-Lookup: alle Aliase, die auf dieses Ziel zeigen ('Barbara', 'Barbi', 'B.'). */
  public listByTarget(targetKey: string): Observable<AliasModel[]> {
    const query = getSystemQuery(this.tenantId);
    query.push({ key: 'targetKey', operator: '==', value: targetKey });
    return this.firestoreService.searchData<AliasModel>(AliasCollection, query, 'alias', 'asc');
  }

  /** Gibt es in diesem Space schon einen Alias für dieses Original? Die Lesehälfte von resolveAlias. */
  public findByOriginal(space: string, original: string): Observable<AliasModel | undefined> {
    const query = getSystemQuery(this.tenantId);
    query.push({ key: 'space', operator: '==', value: space });
    query.push({ key: 'original', operator: '==', value: original });
    return this.firestoreService.searchData<AliasModel>(AliasCollection, query, 'alias', 'asc')
      .pipe(map((aliases) => aliases[0]));
  }
}

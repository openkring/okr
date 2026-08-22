import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { AliasSpaceCollection, AliasSpaceModel } from '@okr/shared-models';
import { getSystemQuery } from '@okr/shared-util-core';

/**
 * Alias-Spaces (planning/specs/2026-08-22-alias-service-spec.md).
 *
 * Volles CRUD, anders als bei `aliases`: ein Space ist eine bewusste Admin-Handlung, kein
 * generiertes Artefakt. Die Unveränderlichkeit von `name` erzwingt das Formular (das Feld wird
 * gesperrt, sobald der Space Aliase hat) — hier steht sie NICHT, weil ein Service, der still
 * Feldänderungen verwirft, schwerer zu debuggen ist als ein gesperrtes Eingabefeld.
 */
@Injectable({ providedIn: 'root' })
export class AliasSpaceService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly tenantId = this.env.tenantId;

  public list(orderBy = 'name', sortOrder: 'asc' | 'desc' = 'asc'): Observable<AliasSpaceModel[]> {
    return this.firestoreService.searchData<AliasSpaceModel>(
      AliasSpaceCollection, getSystemQuery(this.tenantId), orderBy, sortOrder);
  }

  public read(key: string): Observable<AliasSpaceModel | undefined> {
    return this.firestoreService.readModel<AliasSpaceModel>(AliasSpaceCollection, key);
  }

  /** Der Zugriffsweg des Resolvers: der Alias kennt den Namen des Space, nicht dessen okey. */
  public readByName(name: string): Observable<AliasSpaceModel | undefined> {
    return this.list().pipe(map((spaces) => spaces.find((s) => s.name === name)));
  }

  public async create(space: AliasSpaceModel): Promise<string | undefined> {
    return this.firestoreService.createModel<AliasSpaceModel>(AliasSpaceCollection, space);
  }

  public async update(space: AliasSpaceModel): Promise<void> {
    await this.firestoreService.updateModel<AliasSpaceModel>(AliasSpaceCollection, space);
  }

  /**
   * Archivieren statt löschen. Ein gelöschter Space macht jeden seiner Aliase unauflösbar —
   * inklusive der gedruckten.
   */
  public async archive(space: AliasSpaceModel): Promise<void> {
    await this.firestoreService.updateModel<AliasSpaceModel>(
      AliasSpaceCollection, { ...space, isArchived: true });
  }
}

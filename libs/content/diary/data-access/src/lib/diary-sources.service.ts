import { Injectable, inject } from '@angular/core';

import { FirestoreService } from '@okr/shared-data-access';
import { DiarySourceModel, DiarySourcesCollection } from '@okr/shared-models';

/** The owner's own pull settings in the diary app (spec 1.77 §12.3). Document id = the owner's uid, owner-only by the rules. */
@Injectable({ providedIn: 'root' })
export class DiarySourcesService {
  private readonly firestoreService = inject(FirestoreService);

  /** The caller's doc; undefined when there is none yet. Throws when it cannot be read: no answer is not «no sources». */
  public async read(uid: string): Promise<DiarySourceModel | undefined> {
    const doc = await this.firestoreService.readObjectStrict<DiarySourceModel>(`${DiarySourcesCollection}/${uid}`);
    return doc ? { ...doc, okey: uid } : undefined;
  }

  /** Writes the whole doc: createObject is a plain setDoc under the key, so a removed pull goes too. */
  public async save(model: DiarySourceModel, errorMessage?: string): Promise<string | undefined> {
    const { okey, ...data } = model;
    return this.firestoreService.createObject(DiarySourcesCollection, okey, data, undefined, errorMessage);
  }
}

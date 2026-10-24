import { inject, Injectable } from '@angular/core';
import { doc, setDoc } from 'firebase/firestore';
import { map, Observable } from 'rxjs';
import { FirestoreService } from '@okr/shared-data-access';
import { JournalBookCollection, JournalBookModel } from '@okr/shared-models';

/**
 * The travel book document of a journal (spec 1.113 phase 2 §6), `journal-books/{journalKey}`. Authors only
 * (rules); `export` is written by the exportJournalBook function and is never sent from here.
 */
@Injectable({ providedIn: 'root' })
export class JournalBookService {
  private readonly firestoreService = inject(FirestoreService);

  /** Live book document of the journal; emits undefined while it does not exist yet. */
  public book$(journalKey: string): Observable<JournalBookModel | undefined> {
    // not an OkrModel (no isArchived: a book is never archived, rules forbid delete), so readObject + okey by hand
    return this.firestoreService.readObject<JournalBookModel>(JournalBookCollection, journalKey).pipe(
      map((book) => (book ? { ...book, okey: journalKey } : undefined)),
    );
  }

  /**
   * Merge `patch` into the book (creating it on first write). Merge semantics as `updateModel` (a field not in
   * the patch stays), via `setDoc` merge so the first write needs no existence check. Top-level arrays and
   * whole map entries (`albums.<sectionKey>`, `footprints.<pageKey>`) are replaced by the patch value — callers
   * pass entries whole; user keys are never turned into dotted field paths. `export` and `okey` are dropped:
   * the first belongs to the function (and the rules refuse it), the second is the document id.
   */
  public async update(journalKey: string, tenantId: string, patch: Partial<JournalBookModel>, personKey: string): Promise<void> {
    if (!journalKey || !tenantId) throw new Error('JournalBookService.update: journalKey and tenantId are mandatory.');
    const { export: _export, okey: _okey, ...rest } = patch;
    const data = JSON.parse(JSON.stringify({ ...rest, tenants: [tenantId], updatedAt: new Date().toISOString(), updatedBy: personKey }));
    await setDoc(doc(this.firestoreService.firestore, `${JournalBookCollection}/${journalKey}`), data, { merge: true });
  }
}

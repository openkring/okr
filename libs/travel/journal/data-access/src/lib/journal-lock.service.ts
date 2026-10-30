import { Injectable, inject } from '@angular/core';
import { collection, deleteDoc, doc, onSnapshot, query, setDoc, Timestamp, where } from 'firebase/firestore';
import { Observable } from 'rxjs';

import { FIRESTORE } from '@okr/shared-config';
import { JournalLockCollection } from '@okr/shared-models';
import { JournalLock } from '@okr/travel-journal-util';

const lockId = (journalKey: string, entityKey: string): string => `${journalKey}_${entityKey}`;

/**
 * Edit locks in Firestore `journal-locks` (spec 1.126 §6.2), the online path next to the P2P `lock` message.
 * Locks are ephemeral and best effort: every failure is logged and swallowed, nothing here may block editing.
 */
@Injectable({ providedIn: 'root' })
export class JournalLockService {
  private readonly firestore = inject(FIRESTORE);

  /** The live locks of one journal; a listener error ends the stream with `[]`. */
  public watch(journalKey: string): Observable<JournalLock[]> {
    return new Observable<JournalLock[]>((subscriber) =>
      onSnapshot(
        query(collection(this.firestore, JournalLockCollection), where('journalKey', '==', journalKey)),
        (snaps) => {
          subscriber.next(
            snaps.docs.flatMap((d) => {
              const data = d.data();
              const until = data['until'] instanceof Timestamp ? data['until'].toMillis() : 0;
              return typeof data['entityKey'] === 'string' && typeof data['personKey'] === 'string' && until > 0
                ? [{ journalKey, entityKey: data['entityKey'], personKey: data['personKey'], name: String(data['name'] ?? ''), until }]
                : [];
            }),
          );
        },
        (error) => {
          console.error('journal locks: listener failed', error);
          subscriber.next([]);
        },
      ),
    );
  }

  public async put(lock: JournalLock, tenantId: string): Promise<void> {
    try {
      await setDoc(doc(this.firestore, JournalLockCollection, lockId(lock.journalKey, lock.entityKey)), {
        journalKey: lock.journalKey, entityKey: lock.entityKey, personKey: lock.personKey, name: lock.name,
        until: Timestamp.fromMillis(lock.until), tenants: [tenantId],
      });
    } catch (error) {
      console.error('journal locks: put failed', error);
    }
  }

  public async release(journalKey: string, entityKey: string): Promise<void> {
    try {
      await deleteDoc(doc(this.firestore, JournalLockCollection, lockId(journalKey, entityKey)));
    } catch (error) {
      console.error('journal locks: release failed', error);
    }
  }
}

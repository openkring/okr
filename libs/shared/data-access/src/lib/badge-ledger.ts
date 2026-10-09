import {
  BADGE_LEDGER_DB,
  BADGE_LEDGER_KEY,
  BADGE_LEDGER_STORE,
  BadgeLedger,
  badgeLedgerFromPage,
  BadgeParts,
} from '@okr/shared-util-core';

/**
 * The page's half of the app-icon badge ledger (spec 1.93): store the three parts the open app
 * knows, so the push service worker can keep the badge right while the app is closed.
 *
 * Read-modify-write in ONE readwrite transaction, the same way the service worker updates it,
 * so a push arriving at the same moment cannot lose `seen`. Best-effort: IndexedDB can be
 * missing or blocked (private window, cleared site data) — the badge then just behaves as
 * before the ledger, it never breaks the app.
 */
export async function writeBadgeLedgerFromPage(parts: BadgeParts): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    const db = await openBadgeLedgerDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(BADGE_LEDGER_STORE, 'readwrite');
      const store = tx.objectStore(BADGE_LEDGER_STORE);
      const get = store.get(BADGE_LEDGER_KEY);
      get.onsuccess = () => {
        const previous = get.result as BadgeLedger | undefined;
        store.put(badgeLedgerFromPage(previous, parts, Date.now()), BADGE_LEDGER_KEY);
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  } catch (error) {
    console.warn('writeBadgeLedgerFromPage: ledger not written:', error);
  }
}

function openBadgeLedgerDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(BADGE_LEDGER_DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(BADGE_LEDGER_STORE)) {
        request.result.createObjectStore(BADGE_LEDGER_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

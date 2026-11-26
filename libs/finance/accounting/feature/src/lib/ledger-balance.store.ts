import { computed, effect, inject, untracked } from '@angular/core';
import { rxResource, toObservable } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withHooks, withMethods, withProps, withState } from '@ngrx/signals';
import { filter, firstValueFrom, timeout } from 'rxjs';

import { LedgerBalanceModel } from '@okr/shared-models';
import { resourceParams } from '@okr/shared-util-angular';
import { LedgerBalanceService } from '@okr/finance-reporting-data-access';
import { ledgerComputedAt } from '@okr/finance-reporting-util';

import { AccountingStore } from './accounting.store';

/** A refresh younger than this is not repeated when the next screen opens. */
const FRESH_MS = 60_000;
/** How long a refresh waits for its documents to arrive through the listener. */
const ARRIVAL_MS = 5_000;

type LedgerBalanceState = {
  users: number;                 // screens that show balances; the listener runs only while > 0
  refreshing: boolean;
  refreshFailed: boolean;        // the last refresh failed (offline): the stored figures stay, with «Stand»
  lastBooks: string;
  lastRefreshAt: number;         // ms; for the books in lastBooks
};

/** `resource.value()` throws while the resource is in error state (Angular 22): read it only when it has one. */
function valueOf<T>(res: { hasValue(): boolean; value(): T }): T | undefined {
  return res.hasValue() ? res.value() : undefined;
}

/**
 * The ledger balances of the selected books (spec 1.177 §6.3), shared by every screen that shows totals: Bilanz,
 * Erfolgsrechnung, Budget, Perioden. One listener on ≤ 10 small documents instead of the whole ledger. A screen calls
 * `use()` when it opens and `release()` when it closes; opening refreshes the balances through the `ledger`
 * function unless that happened within the last minute. The figures are shown at once and repaint when the refresh
 * has written them; a failed refresh keeps them, and `computedAt` says how old they are.
 */
export const LedgerBalanceStore = signalStore(
  { providedIn: 'root' },
  withState<LedgerBalanceState>({ users: 0, refreshing: false, refreshFailed: false, lastBooks: '', lastRefreshAt: 0 }),
  withProps(() => ({
    service: inject(LedgerBalanceService),
    accountingStore: inject(AccountingStore),
  })),
  withProps(store => ({
    docsResource: rxResource({
      params: resourceParams(() => store.users() > 0 && store.accountingStore.accountingTenantId()
        ? { books: store.accountingStore.accountingTenantId() } : undefined),
      stream: ({ params }) => store.service.list(params.books),
    }),
  })),
  withComputed(store => ({
    books: computed(() => store.accountingStore.accountingTenantId()),
    docs: computed<LedgerBalanceModel[]>(() => valueOf(store.docsResource) ?? []),
  })),
  withComputed(store => ({
    /** StoreDateTime of the newest document ('' = none yet): the «Stand» of the figures */
    computedAt: computed(() => ledgerComputedAt(store.docs())),
    /** nothing to show yet: the listener has not answered, or there is no document and the first refresh runs */
    isLoading: computed(() => store.users() > 0
      && (store.docsResource.isLoading() || (store.docs().length === 0 && store.refreshing()))),
  })),
  withProps(store => ({
    computedAt$: toObservable(store.computedAt),
    /** true once the listener has answered and no refresh runs: the figures are as current as they get */
    ready$: toObservable(computed(() => store.docsResource.hasValue() && !store.docsResource.isLoading() && !store.refreshing())),
  })),
  withMethods(store => {
    let running: Promise<boolean> | undefined;

    async function run(books: string, full: boolean): Promise<boolean> {
      patchState(store, { refreshing: true });
      try {
        const result = await store.service.refresh(books, full);
        // the callable has written; wait (briefly) until the listener delivers the new snapshot
        await firstValueFrom(store.computedAt$.pipe(filter(at => at >= result.computedAt), timeout(ARRIVAL_MS))).catch(() => undefined);
        patchState(store, { refreshFailed: false, lastBooks: books, lastRefreshAt: Date.now() });
        return true;
      } catch (err) {
        console.warn('LedgerBalanceStore.refresh failed:', err);
        patchState(store, { refreshFailed: true });
        return false;
      } finally {
        patchState(store, { refreshing: false });
      }
    }

    const isFresh = (books: string): boolean => store.lastBooks() === books && Date.now() - store.lastRefreshAt() < FRESH_MS;

    return {
      /**
       * Recomputes the balances of the selected books. `full` rebuilds every year (definitive PDF, an unbalanced
       * Bilanz). Resolves false when it failed (offline, no permission); the stored figures stay.
       */
      async refresh(full = false): Promise<boolean> {
        const books = store.books();
        if (!books) return false;
        if (running && !full) return running;
        if (running) await running.catch(() => undefined);
        running = run(books, full);
        try {
          return await running;
        } finally {
          running = undefined;
        }
      },

      /** A screen with balances opens: listen, and refresh unless that was done for these books a minute ago. */
      use(): void {
        patchState(store, { users: store.users() + 1 });
        const books = store.books();
        if (books && !isFresh(books)) void this.refresh();
      },

      /** The app itself changed the ledger (journal edit, review, import): the next screen refreshes at once. */
      markStale(): void {
        patchState(store, { lastRefreshAt: 0 });
      },

      /**
       * The documents once they are as current as they get: listener answered, refresh (if any) done. For a figure read
       * on demand (journal saldo, cash-flow opening) between `use()` and `release()`. Gives up after 20 s.
       */
      async whenReady(): Promise<LedgerBalanceModel[]> {
        await firstValueFrom(store.ready$.pipe(filter(ready => ready), timeout(20_000))).catch(() => undefined);
        return store.docs();
      },
      release(): void {
        patchState(store, { users: Math.max(0, store.users() - 1) });
      },
    };
  }),
  withHooks(store => ({
    onInit(): void {
      // refresh when a screen opens and when the books change while one is open
      effect(() => {
        const books = store.books();
        const users = store.users();
        if (!books || users === 0) return;
        untracked(() => {
          // the books changed while a screen is open (books switcher); use() covers the opening itself
          if (store.lastBooks() === books && Date.now() - store.lastRefreshAt() < FRESH_MS) return;
          if (store.refreshing()) return;
          void store.refresh();
        });
      });
    },
  })),
);

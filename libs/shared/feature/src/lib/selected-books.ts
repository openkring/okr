import { computed, inject, Injectable, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { of, Subject } from 'rxjs';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { AccountingConfigCollection, AccountingConfigModel } from '@okr/shared-models';
import { getSystemQuery, hasRole } from '@okr/shared-util-core';
import { resourceParams } from '@okr/shared-util-angular';

import { AppStore } from './app.store';

/** localStorage key prefix of the books choice, per app tenant: `okr.accounting.books.<tenantId>`. */
export const SELECTED_BOOKS_STORAGE_PREFIX = 'okr.accounting.books.';

/** The books last chosen for this app tenant ('' = none or storage unavailable). */
export function readStoredBooks(tenantId: string): string {
  if (!tenantId) return '';
  try { return localStorage.getItem(SELECTED_BOOKS_STORAGE_PREFIX + tenantId) ?? ''; } catch { return ''; }
}

/** Remember the books choice in this browser — a convenience, losing it is harmless. */
export function writeStoredBooks(tenantId: string, books: string): void {
  if (!tenantId || !books) return;
  try { localStorage.setItem(SELECTED_BOOKS_STORAGE_PREFIX + tenantId, books); } catch { /* private mode */ }
}

/**
 * Which books the navigation shows: the choice, while it is one of the available books (or the list is
 * not known — not loaded yet, or not a treasurer), else the default books. There is deliberately NO
 * tenantId input: the app tenant is never the books.
 */
export function resolveCurrentBooks(chosen: string, available: string[], defaultBooks: string): string {
  if (chosen && (available.length === 0 || available.includes(chosen))) return chosen;
  return defaultBooks;
}

/**
 * The books the accounting navigation shows (spec 1.100 §4.2). Lives in shared-feature so the menu
 * (cms: '@BOOKS@' and the books switcher row inside «Buchhaltung») and the accounting screens
 * (finance) read one selection without cms depending on finance.
 *
 * - `available`: the app tenant's accounting-configs, read for treasurers only — nobody else sees
 *   the accounting menu, so other users pay no read.
 * - `current`: the choice while it is available, else `appConfig().defaultAccountingTenantId`.
 * - `choose`: the books of a visited accounting route become the choice, so the menu matches the page.
 * - `switchTo`: an explicit switch in the menu; also emits `switched$`, on which AccountingStore moves
 *   an open accounting page to the same screen in the other books.
 */
@Injectable({ providedIn: 'root' })
export class SelectedBooks {
  private readonly tenantId = inject(ENV).tenantId ?? '';
  private readonly appStore = inject(AppStore);
  private readonly firestore = inject(FirestoreService);

  private readonly chosen = signal(readStoredBooks(this.tenantId));
  private readonly switchedTo = new Subject<string>();
  public readonly switched$ = this.switchedTo.asObservable();

  private readonly availableResource = rxResource({
    params: resourceParams(() => ({
      userKey: this.appStore.currentUser()?.okey ?? '',
      isTreasurer: hasRole('treasurer', this.appStore.currentUser()),
    })),
    stream: ({ params }) => params.userKey && params.isTreasurer
      ? this.firestore.searchData<AccountingConfigModel>(AccountingConfigCollection, getSystemQuery(this.tenantId), 'none')
      : of([] as AccountingConfigModel[]),
  });

  public readonly available = computed(() =>
    ((this.availableResource.hasValue() ? this.availableResource.value() : undefined) ?? []).map(c => c.okey).sort());

  public readonly current = computed(() =>
    resolveCurrentBooks(this.chosen(), this.available(), this.appStore.appConfig().defaultAccountingTenantId ?? ''));

  public choose(id: string): void {
    if (!id || id === this.chosen()) return;
    this.chosen.set(id);
    writeStoredBooks(this.tenantId, id);
  }

  public switchTo(id: string): void {
    if (!id) return;
    const changed = id !== this.current();
    this.choose(id);
    if (changed) this.switchedTo.next(id);
  }
}

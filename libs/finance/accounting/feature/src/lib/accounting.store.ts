import { computed, effect, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { of } from 'rxjs';
import { patchState, signalStore, withComputed, withHooks, withMethods, withProps, withState } from '@ngrx/signals';

import { AppStore, SelectedBooks } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { AccountingConfigModel } from '@okr/shared-models';
import { resourceParams } from '@okr/shared-util-angular';

import { AccountingConfigService } from '@okr/finance-accounting-data-access';
import { ACCOUNTING_I18N_KEYS, resolveSelectedBooks } from '@okr/finance-accounting-util';

const BOOKS_STORAGE_PREFIX = 'okr.accounting.books.';

function readStoredBooks(tenantId: string): string {
  try { return localStorage.getItem(BOOKS_STORAGE_PREFIX + tenantId) ?? ''; } catch { return ''; }
}
function writeStoredBooks(tenantId: string, books: string): void {
  try { localStorage.setItem(BOOKS_STORAGE_PREFIX + tenantId, books); } catch { /* private mode: the choice is a convenience */ }
}

export type AccountingState = { accountingTenantId: string; storedBooks: string };

export const AccountingStore = signalStore(
  { providedIn: 'root' },
  withState<AccountingState>({
    accountingTenantId: '',
    storedBooks: ''
  }),
  withProps(() => ({
    configService: inject(AccountingConfigService),
    appStore: inject(AppStore),
    i18n: inject(I18nService).translateAll(ACCOUNTING_I18N_KEYS),
    selectedBooksSignal: inject(SelectedBooks),
  })),
  withProps(store => ({
    availableBooksResource: rxResource({
      params: resourceParams(() => ({ userKey: store.appStore.currentUser()?.okey ?? '' })),
      // the app tenant's sets of books; never ordered by okey (see listForTenant)
      stream: ({ params }) => params.userKey ? store.configService.listForTenant() : of([] as AccountingConfigModel[]),
    }),
    configResource: rxResource({
      // The key is the USER'S IDENTITY, never the model object: `currentUser` is a live
      // Firestore stream, so a new reference arrives on every snapshot and `rxResource`
      // compares params by identity. Passing the object restarted the resource on each of
      // those, dropping `value()` back to undefined — and the settings page reads exactly
      // that value to decide create-vs-update (SCS-AY: a create against an existing
      // `accounting-configs/gss`, blocked only by the createModel overwrite guard).
      params: resourceParams(() => ({
        userKey: store.appStore.currentUser()?.okey ?? '',
        accountingTenantId: store.accountingTenantId(),
      })),
      // Guard on the user key so the config read waits for auth to resolve; without
      // it a cold load fires with request.auth == null and hits permission-denied.
      stream: ({ params }) =>
        params.userKey && params.accountingTenantId
          ? store.configService.read(params.accountingTenantId)
          : of(undefined),
    }),
  })),
  withComputed(store => ({
    config: computed(() => store.configResource.value()),
    // True only once the config read has actually answered for the current user and tenant.
    // `value() === undefined` alone is ambiguous — it is both "no config document yet" and
    // "not read yet"; a writer must never confuse the two (SCS-AY).
    configLoaded: computed(() =>
      !!store.appStore.currentUser()?.okey && !!store.accountingTenantId()
      && (store.configResource.status() === 'resolved' || store.configResource.status() === 'local')),
    // Absent/loading config means "not known to be external" — default native, same coalesce as the
    // OCR trigger. Without the ?? every page renders read-only until the config resolves.
    isExternallyManaged: computed(() => (store.configResource.value()?.accountingBackend ?? 'native') !== 'native'),
    availableBooks: computed(() => (store.availableBooksResource.value() ?? []).map(c => c.okey).sort()),
    selectedBooks: computed(() => resolveSelectedBooks({
      routeBooks: store.accountingTenantId(),
      storedChoice: store.storedBooks(),
      defaultBooks: store.appStore.appConfig().defaultAccountingTenantId ?? '',
      available: (store.availableBooksResource.value() ?? []).map(c => c.okey),
    })),
    currentUser: computed(() => store.appStore.currentUser()),
    tenantId: computed(() => store.appStore.tenantId()),
  })),
  withMethods(store => ({
    setTenant(id: string): void {
      patchState(store, { accountingTenantId: id, storedBooks: id || store.storedBooks() });
      if (id) writeStoredBooks(store.appStore.tenantId(), id);
    },
    async createConfig(config: AccountingConfigModel): Promise<void> {
      await store.configService.create(config, store.currentUser());
    },
    async updateConfig(config: AccountingConfigModel): Promise<void> {
      await store.configService.update(config, store.currentUser());
      store.configResource.reload();
    },
  })),
  withHooks(store => ({
    onInit(): void {
      patchState(store, { storedBooks: readStoredBooks(store.appStore.tenantId()) });
      // hand the selection to the menu ('@BOOKS@'), see SelectedBooks
      effect(() => store.selectedBooksSignal.set(store.selectedBooks()));
    },
  }))
);

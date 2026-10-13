import { computed, effect, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { of } from 'rxjs';
import { patchState, signalStore, withComputed, withHooks, withMethods, withProps, withState } from '@ngrx/signals';

import { AppStore, readStoredBooks, SelectedBooks, writeStoredBooks } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { AccountingConfigModel } from '@okr/shared-models';
import { resourceParams } from '@okr/shared-util-angular';

import { AccountingConfigService } from '@okr/finance-accounting-data-access';
import { ACCOUNTING_I18N_KEYS, resolveSelectedBooks } from '@okr/finance-accounting-util';

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
    /** the books of the visited route — wins for this visit, but is NOT remembered (spec 1.100 §4.2) */
    setTenant(id: string): void {
      patchState(store, { accountingTenantId: id });
    },
    /** an EXPLICIT choice (the books switcher): remembered in this browser, the menu follows it after a reload */
    chooseBooks(id: string): void {
      if (!id) return;
      patchState(store, { storedBooks: id });
      writeStoredBooks(store.appStore.tenantId(), id);
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
      // hand the validated selection to the menu ('@BOOKS@'), see SelectedBooks. While the books are
      // not loaded and no route names them, resolveSelectedBooks can only answer the default — keep the
      // stored choice SelectedBooks was seeded with instead of overwriting it.
      effect(() => {
        const selected = store.selectedBooks();
        if (store.availableBooks().length > 0 || store.accountingTenantId()) store.selectedBooksSignal.set(selected);
      });
    },
  }))
);

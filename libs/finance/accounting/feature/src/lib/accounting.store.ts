import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { of } from 'rxjs';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { AccountingConfigModel } from '@okr/shared-models';

import { AccountingConfigService } from '@okr/finance-accounting-data-access';
import { ACCOUNTING_I18N_KEYS } from '@okr/finance-accounting-util';

export type AccountingState = { accountingTenantId: string };

export const AccountingStore = signalStore(
  { providedIn: 'root' },
  withState<AccountingState>({
    accountingTenantId: ''
  }),
  withProps(() => ({
    configService: inject(AccountingConfigService),
    appStore: inject(AppStore),
    i18n: inject(I18nService).translateAll(ACCOUNTING_I18N_KEYS),
  })),
  withProps(store => ({
    configResource: rxResource({
      params: () => ({
        currentUser: store.appStore.currentUser(),
        accountingTenantId: store.accountingTenantId(),
      }),
      // Guard on currentUser so the config read waits for auth to resolve; without
      // it a cold load fires with request.auth == null and hits permission-denied.
      stream: ({ params }) =>
        params.currentUser && params.accountingTenantId
          ? store.configService.read(params.accountingTenantId)
          : of(undefined),
    }),
  })),
  withComputed(store => ({
    config: computed(() => store.configResource.value()),
    // Absent/loading config means "not known to be external" — default native, same coalesce as the
    // OCR trigger. Without the ?? every page renders read-only until the config resolves.
    isExternallyManaged: computed(() => (store.configResource.value()?.accountingBackend ?? 'native') !== 'native'),
    currentUser: computed(() => store.appStore.currentUser()),
    tenantId: computed(() => store.appStore.tenantId()),
  })),
  withMethods(store => ({
    setTenant(id: string): void {
      patchState(store, { accountingTenantId: id });
    },
    async createConfig(config: AccountingConfigModel): Promise<void> {
      await store.configService.create(config, store.currentUser());
    },
    async updateConfig(config: AccountingConfigModel): Promise<void> {
      await store.configService.update(config, store.currentUser());
      store.configResource.reload();
    },
  }))
);

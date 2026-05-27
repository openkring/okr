import { computed, inject, Signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { of } from 'rxjs';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { AppStore } from '@bk2/shared-feature';
import { I18nService } from '@bk2/shared-i18n';
import { AccountingConfigModel } from '@bk2/shared-models';

import { AccountingConfigService } from '@bk2/finance-accounting-data-access';

import { PFX } from './scope';

const ACCOUNTING_I18N_KEYS = {
  read_only_title: PFX + 'readonly.title',
  read_only_msg:   PFX + 'readonly.msg',
  select_tenant:   PFX + 'select.tenant',
} satisfies Record<string, string>;

export type AccountingI18n = { [K in keyof typeof ACCOUNTING_I18N_KEYS]: Signal<string> };

export type AccountingState = { accountingTenantId: string };

export const AccountingStore = signalStore(
  withState<AccountingState>({ accountingTenantId: '' }),
  withProps(() => ({
    configService: inject(AccountingConfigService),
    appStore: inject(AppStore),
    i18nService: inject(I18nService),
  })),
  withProps(store => ({
    i18n: store.i18nService.translateAll(ACCOUNTING_I18N_KEYS),
    configResource: rxResource({
      stream: () => {
        const id = store.accountingTenantId();
        return id ? store.configService.read(id) : of(undefined);
      },
    }),
    tenantsResource: rxResource({
      stream: () => store.configService.listForTenant(),
    }),
  })),
  withComputed(store => ({
    config: computed(() => store.configResource.value()),
    availableTenants: computed(() => store.tenantsResource.value() ?? []),
    isExternallyManaged: computed(() => store.configResource.value()?.accountingBackend !== 'native'),
    currentUser: computed(() => store.appStore.currentUser()),
    tenantId: computed(() => store.appStore.tenantId()),
  })),
  withMethods(store => ({
    setTenant(id: string): void {
      patchState(store, { accountingTenantId: id });
    },
    async createConfig(config: AccountingConfigModel): Promise<void> {
      await store.configService.create(config, store.currentUser());
      store.tenantsResource.reload();
    },
    async updateConfig(config: AccountingConfigModel): Promise<void> {
      await store.configService.update(config, store.currentUser());
      store.configResource.reload();
    },
  }))
);

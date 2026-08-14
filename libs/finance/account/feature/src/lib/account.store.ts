import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { of } from 'rxjs';

import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { AccountModel } from '@okr/shared-models';

import { AccountService } from '@okr/finance-account-data-access';
import { ACCOUNT_I18N_KEYS, AccountI18n, flattenAccountForest, getDefaultExpandedKeys, isAccount } from '@okr/finance-account-util';
import { AccountingStore } from '@okr/finance-accounting-feature';

export type { AccountI18n };

export type AccountListState = {
  // null = the user hasn't toggled anything yet -> the default 2-tier expansion is used.
  userExpandedKeys: string[] | null;
};

export const initialState: AccountListState = {
  userExpandedKeys: null,
};

export const AccountStore = signalStore(
  withState(initialState),
  withProps(() => ({
    accountService: inject(AccountService),
    appStore: inject(AppStore),
    accountingStore: inject(AccountingStore),
    modalController: inject(ModalController),
    i18nService: inject(I18nService),
  })),
  withProps(store => ({
    i18n: store.i18nService.translateAll(ACCOUNT_I18N_KEYS),
  })),
  withProps((store) => ({
    accountsResource: rxResource({
      params: () => store.accountingStore.accountingTenantId(),
      stream: ({ params: accountingTenantId }) =>
        accountingTenantId ? store.accountService.list(accountingTenantId) : of([]),
    })
  })),

  withComputed((state) => ({
    accounts: computed(() => state.accountsResource.value() ?? []),
    isLoading: computed(() => state.accountsResource.isLoading()),
    currentUser: computed(() => state.appStore.currentUser()),
    isReadOnly: computed(() => state.accountingStore.isExternallyManaged()),
    // Resolved expansion: the user's manual set once they've toggled, otherwise the default 2-tier set.
    expandedKeys: computed(() =>
      state.userExpandedKeys() ?? getDefaultExpandedKeys(state.accountsResource.value() ?? [])
    ),
  })),

  withComputed((state) => ({
    visibleNodes: computed(() =>
      flattenAccountForest(state.accountsResource.value() ?? [], state.expandedKeys())
    ),
  })),

  withMethods((store) => ({
    reset(): void {
      patchState(store, initialState);
      store.accountsResource.reload();
    },

    /*-------------------------- tree expansion --------------------------------*/
    toggleExpand(okey: string): void {
      const current = store.expandedKeys();
      const next = current.includes(okey)
        ? current.filter(k => k !== okey)
        : [...current, okey];
      patchState(store, { userExpandedKeys: next });
    },

    /*-------------------------- actions --------------------------------*/
    async addRoot(): Promise<void> {
      const account = new AccountModel(store.appStore.tenantId());
      account.accountingTenantId = store.accountingStore.accountingTenantId();
      account.type = 'root';
      await this.edit(account, false);
    },

    async addChild(parentKey: string): Promise<void> {
      const account = new AccountModel(store.appStore.tenantId());
      account.accountingTenantId = store.accountingStore.accountingTenantId();
      account.parentKey = parentKey;
      account.type = 'leaf';
      await this.edit(account, false);
    },

    async edit(account: AccountModel, readOnly = true): Promise<void> {
      // Lazy import to break the store <-> modal circular reference at module load time.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { AccountEditModal } = await import('./account-edit.modal' as any);
      const modal = await store.modalController.create({
        component: AccountEditModal,
        componentProps: {
          account,
          currentUser: store.currentUser(),
          readOnly
        }
      });
      modal.present();
      const { data, role } = await modal.onDidDismiss();
      if (role === 'confirm' && data) {
        if (isAccount(data, store.appStore.tenantId())) {
          if (data.okey?.length > 0) {
            await store.accountService.update(data, store.currentUser());
          } else {
            const newKey = await store.accountService.create(data, store.currentUser());
            // auto-expand the parent so new child is visible
            if (newKey && data.parentKey) {
              patchState(store, {
                userExpandedKeys: [...store.expandedKeys(), data.parentKey]
              });
            }
          }
        }
      }
      store.accountsResource.reload();
    },

    /**
     * Deleting any node (leaf, group, root) cascades to all its descendants.
     * @param account
     * @param readOnly
     * @returns
     */
    async delete(account: AccountModel, readOnly = true): Promise<void> {
      if (readOnly) return;
      await store.accountService.deleteTree(account.okey, store.accountingStore.accountingTenantId(), store.currentUser());
      store.accountsResource.reload();
    },

    /** Seeds the standard Swiss KMU chart of accounts — offered while the tenant has no accounts. */
    async seedStandard(): Promise<void> {
      if (store.isReadOnly()) return;
      await store.accountService.seedChartOfAccounts(store.appStore.tenantId(), store.accountingStore.accountingTenantId());
      store.accountsResource.reload();
    },

    async exportPlan(): Promise<void> {
      console.log('AccountStore.exportPlan is not yet implemented.');
    },

    getTitleLabel(readOnly: boolean, key?: string): string {
      if (readOnly) {
        return store.i18n.view();
      }
      if (key && key.length > 0) {
        return store.i18n.update();
      } else {
        return store.i18n.create();
      }
    }
  }))
);

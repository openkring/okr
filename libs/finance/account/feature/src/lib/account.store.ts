import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { of } from 'rxjs';

import { AppStore } from '@bk2/shared-feature';
import { I18nService } from '@bk2/shared-i18n';
import { AccountModel } from '@bk2/shared-models';

import { AccountService } from '@bk2/finance-account-data-access';
import { ACCOUNT_I18N_KEYS, AccountI18n, flattenAccountTree, isAccount } from '@bk2/finance-account-util';
import { AccountingStore } from '@bk2/finance-accounting-feature';

export type { AccountI18n };

export type AccountListState = {
  selectedRootKey: string;
  expandedKeys: string[];
};

export const initialState: AccountListState = {
  selectedRootKey: '',
  expandedKeys: [],
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
    rootAccounts: computed(() =>
      (state.accountsResource.value() ?? []).filter(a => a.type === 'root')
    ),
    visibleNodes: computed(() =>
      flattenAccountTree(
        state.accountsResource.value() ?? [],
        state.selectedRootKey(),
        state.expandedKeys()
      )
    ),
  })),

  withMethods((store) => ({
    reset(): void {
      patchState(store, initialState);
      store.accountsResource.reload();
    },

    /*-------------------------- root selection --------------------------------*/
    selectRoot(rootKey: string): void {
      patchState(store, { selectedRootKey: rootKey, expandedKeys: [] });
    },

    /*-------------------------- tree expansion --------------------------------*/
    toggleExpand(bkey: string): void {
      const current = store.expandedKeys();
      const next = current.includes(bkey)
        ? current.filter(k => k !== bkey)
        : [...current, bkey];
      patchState(store, { expandedKeys: next });
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
          if (data.bkey?.length > 0) {
            await store.accountService.update(data, store.currentUser());
          } else {
            const newKey = await store.accountService.create(data, store.currentUser());
            // auto-expand the parent so new child is visible
            if (newKey && data.parentKey) {
              patchState(store, {
                expandedKeys: [...store.expandedKeys(), data.parentKey]
              });
            }
          }
        }
      }
      store.accountsResource.reload();
    },

    /**
     * Deleting any node (leaf, group, root) cascades to all its descendants.
     * If the deleted node happens to be the currently selected root, the selection is cleared.
     * @param account 
     * @param readOnly 
     * @returns 
     */
    async delete(account: AccountModel, readOnly = true): Promise<void> {
      if (readOnly) return;
      await store.accountService.deleteTree(account.bkey, store.accountingStore.accountingTenantId(), store.currentUser());
      if (store.selectedRootKey() === account.bkey) {
        patchState(store, { selectedRootKey: '', expandedKeys: [] });
      }
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

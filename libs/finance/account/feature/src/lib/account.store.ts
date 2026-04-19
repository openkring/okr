import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { AppStore } from '@bk2/shared-feature';
import { AccountModel } from '@bk2/shared-models';

import { AccountService } from '@bk2/finance-account-data-access';
import { flattenAccountTree, isAccount } from '@bk2/finance-account-util';

import { AccountEditModalComponent } from './account-edit.modal';

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
    modalController: inject(ModalController),
  })),
  withProps((store) => ({
    accountsResource: rxResource({
      stream: () => store.accountService.list()
    })
  })),

  withComputed((state) => ({
    accounts: computed(() => state.accountsResource.value() ?? []),
    isLoading: computed(() => state.accountsResource.isLoading()),
    currentUser: computed(() => state.appStore.currentUser()),
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
      account.type = 'root';
      await this.edit(account, false);
    },

    async addChild(parentId: string): Promise<void> {
      const account = new AccountModel(store.appStore.tenantId());
      account.parentId = parentId;
      account.type = 'leaf';
      await this.edit(account, false);
    },

    async edit(account: AccountModel, readOnly = true): Promise<void> {
      const modal = await store.modalController.create({
        component: AccountEditModalComponent,
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
            if (newKey && data.parentId) {
              patchState(store, {
                expandedKeys: [...store.expandedKeys(), data.parentId]
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
      await store.accountService.deleteTree(account.bkey, store.currentUser());
      if (store.selectedRootKey() === account.bkey) {
        patchState(store, { selectedRootKey: '', expandedKeys: [] });
      }
      store.accountsResource.reload();
    },

    async exportPlan(): Promise<void> {
      console.log('AccountStore.exportPlan is not yet implemented.');
    },
  }))
);

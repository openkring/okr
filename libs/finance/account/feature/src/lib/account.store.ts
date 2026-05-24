import { computed, inject, Signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { AppStore } from '@bk2/shared-feature';
import { I18nService } from '@bk2/shared-i18n';
import { AccountModel } from '@bk2/shared-models';

import { AccountService } from '@bk2/finance-account-data-access';
import { flattenAccountTree, isAccount } from '@bk2/finance-account-util';

import { AccountEditModal } from './account-edit.modal';
import { PFX } from './scope';

const ACCOUNT_I18N_KEYS = {
  accounts:         PFX + 'accounts',
  empty:            PFX + 'empty',
  id:               PFX + 'id',
  name:             PFX + 'name',
  select_root:      PFX + 'select.root',
  select_hint:      PFX + 'select.hint',
  as_title:         PFX + 'actionsheet.title',
  as_view:          PFX + 'actionsheet.view',
  as_edit:          PFX + 'actionsheet.edit',
  as_create:        PFX + 'actionsheet.create',
  as_delete:        PFX + 'actionsheet.delete',
  save:           '@save.label',
  cancel:           '@cancel',
  ok:               '@ok',
  bkey_label:           PFX + 'bkey.label',
  bkey_placeholder:     PFX + 'bkey.placeholder',
  bkey_helper:          PFX + 'bkey.helper',
  id_label:             PFX + 'id.label',
  id_placeholder:       PFX + 'id.placeholder',
  id_helper:            PFX + 'id.helper',
  name_label:           PFX + 'name.label',
  name_placeholder:     PFX + 'name.placeholder',
  name_helper:          PFX + 'name.helper',
  label_label:          PFX + 'label.label',
  label_placeholder:    PFX + 'label.placeholder',
  label_helper:         PFX + 'label.helper',
  parentId_label:       PFX + 'parentId.label',
  parentId_placeholder: PFX + 'parentId.placeholder',
  parentId_helper:      PFX + 'parentId.helper',
  notes_label:          PFX + 'notes.label',
  notes_placeholder:    PFX + 'notes.placeholder',
} satisfies Record<string, string>;

export type AccountI18n = { [K in keyof typeof ACCOUNT_I18N_KEYS]: Signal<string> };

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
    i18nService: inject(I18nService),
  })),
  withProps(store => ({
    i18n: store.i18nService.translateAll(ACCOUNT_I18N_KEYS),
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

    async addChild(parentKey: string): Promise<void> {
      const account = new AccountModel(store.appStore.tenantId());
      account.parentKey = parentKey;
      account.type = 'leaf';
      await this.edit(account, false);
    },

    async edit(account: AccountModel, readOnly = true): Promise<void> {
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
      await store.accountService.deleteTree(account.bkey, store.currentUser());
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
        return store.i18n.as_view();
      }
      if (key && key.length > 0) {
        return store.i18n.as_edit();
      } else {
        return store.i18n.as_create();
      }
    }
  }))
);

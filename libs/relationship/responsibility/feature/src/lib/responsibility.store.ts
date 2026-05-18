import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController, ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { AppStore } from '@bk2/shared-feature';
import { confirm } from '@bk2/shared-util-angular';
import { CategoryListModel, ResponsibilityModel } from '@bk2/shared-models';
import { debugListLoaded, isValidAt, nameMatches } from '@bk2/shared-util-core';
import { END_FUTURE_DATE_STR } from '@bk2/shared-constants';
import { I18nService } from '@bk2/shared-i18n';

import { ResponsibilityService } from '@bk2/relationship-responsibility-data-access';
import { isResponsibility } from '@bk2/relationship-responsibility-util';

import { ResponsibilityEditModal } from './responsibility-edit.modal';
import { PFX } from './scope';

export type ResponsibilityState = {
  listId: string;          // 'k_key', 'r_responsibleKey', 'all'
  key: string | undefined;
  responsibleId: string | undefined;
  showOnlyCurrent: boolean;
  searchTerm: string;
};

const initialState: ResponsibilityState = {
  listId: 'all',
  key: undefined,
  responsibleId: undefined,
  showOnlyCurrent: true,
  searchTerm: '',
};

export const ResponsibilityStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    responsibilityService: inject(ResponsibilityService),
    alertController: inject(AlertController),
    modalController: inject(ModalController),
    i18nService: inject(I18nService)
  })),
  withProps((store) => ({
    i18n: store.i18nService.translateAll({
      delete_confirm: PFX + 'delete.confirm',
      update_header: PFX + 'update.header',
      update_message1: PFX + 'update.message1',
      update_message2: PFX + 'update.message2',
      ok:         '@ok',
      cancel:     '@cancel',
      list_title: '@responsibility.list.title',
    }),

    allResponsibilitiesResource: rxResource({
      params: () => ({ currentUser: store.appStore.currentUser() }),
      stream: ({ params }) =>
        store.responsibilityService.list().pipe(
          debugListLoaded('ResponsibilityStore.allResponsibilities', params.currentUser)
        ),
    }),
  })),

  withComputed((state) => ({
    allResponsibilities: computed(() => state.allResponsibilitiesResource.value() ?? []),
    currentResponsibilities: computed(() =>
      (state.allResponsibilitiesResource.value() ?? []).filter(r => isValidAt(r.validFrom, r.validTo))
    ),
    responsibilities: computed(() =>
      state.showOnlyCurrent()
        ? (state.allResponsibilitiesResource.value() ?? []).filter(r => isValidAt(r.validFrom, r.validTo))
        : (state.allResponsibilitiesResource.value() ?? [])
    ),
    isLoading: computed(() => state.allResponsibilitiesResource.isLoading()),
    tenantId: computed(() => state.appStore.tenantId()),
    currentUser: computed(() => state.appStore.currentUser()),
  })),

  withComputed((state) => ({
    filteredResponsibilities: computed(() => {
      let filtered = state.responsibilities();
      const listId = state.listId();

      if (listId && listId !== 'all') {
        const prefix = listId.substring(0, 2);
        const value = listId.substring(2);
        switch (prefix) {
          case 'k_':
            filtered = filtered.filter(r => r.bkey === value);
            break;
          case 'r_':
            filtered = filtered.filter(r => r.responsibleAvatar?.key === value || r.delegateAvatar?.key === value);
            break;
        }
      }

      return filtered.filter(r =>
        nameMatches(r.index, state.searchTerm())
      );
    }),
  })),

  withMethods((store) => ({
    reload() {
      store.allResponsibilitiesResource.reload();
    },

    setListId(listId: string) {
      patchState(store, { listId });
      this.reload();
    },

    setShowMode(showOnlyCurrent: boolean) {
      patchState(store, { showOnlyCurrent });
    },

    setSearchTerm(searchTerm: string) {
      patchState(store, { searchTerm });
    },

    getLocale(): string {
      return store.appStore.appConfig().locale;
    },

    async add(readOnly = true): Promise<void> {
      if (readOnly) return;
      const r = new ResponsibilityModel(store.tenantId());
      await this.edit(r, true);
    },

    async edit(responsibility: ResponsibilityModel, isNew = false): Promise<void> {
      const modal = await store.modalController.create({
        component: ResponsibilityEditModal,
        componentProps: {
          responsibility,
          currentUser: store.currentUser(),
          locale: this.getLocale(),
          isNew
        },
      });
      modal.present();
      const { data, role } = await modal.onDidDismiss();
      if (role === 'confirm' && data) {
        if (isResponsibility(data, store.tenantId())) {
          if (isNew) {
          // bkey is user-defined. Therefore, we need to check for duplicates when creating a new responsibility.
            const existingResp = store.allResponsibilities()?.find((r: ResponsibilityModel) => r.bkey === data.bkey);
            if (existingResp) {
              const alert = await store.alertController.create({
                header: store.i18n.update_header(),
                message: store.i18n.update_message1() + data.bkey + store.i18n.update_message2(),
                buttons: [store.i18n.ok()]
              });
              await alert.present();
              return;
            }
            data.validTo = END_FUTURE_DATE_STR;
            await store.responsibilityService.create(data, store.currentUser());
          } else {
            await store.responsibilityService.update(data, store.currentUser());
          }
          this.reload();
        }
      }
    },

    async delete(responsibility?: ResponsibilityModel, readOnly = true): Promise<void> {
      if (!responsibility || readOnly) return;
      const result = await confirm(store.alertController, store.i18n.delete_confirm(), store.i18n.ok(), store.i18n.cancel(), true);
      if (result === true) {
        await store.responsibilityService.delete(responsibility, store.appStore.currentUser());
        this.reload();
      }
    },

    /******************************* other *************************************** */
    async export(type: string): Promise<void> {
      console.log(`ResponsibilityStore.export(${type}) is not yet implemented.`);
    }
  }))
);

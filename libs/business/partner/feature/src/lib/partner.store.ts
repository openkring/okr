import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { PartnerModel } from '@okr/shared-models';
import { debugListLoaded, nameMatches } from '@okr/shared-util-core';
import { AlertService } from '@okr/shared-util-angular';

import { PartnerService } from '@okr/business-partner-data-access';
import { PARTNER_I18N_KEYS, newPartnerModel } from '@okr/business-partner-util';

// A plain import is safe here: the modal resolves its i18n through `I18nService` and never injects
// this store, so there is no import cycle to break with a dynamic import.
import { PartnerEditModal } from './partner-edit.modal';

export type PartnerState = {
  searchTerm: string;
};

const initialState: PartnerState = {
  searchTerm: '',
};

export const PartnerStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    modalController: inject(ModalController),
    alertService: inject(AlertService),
    partnerService: inject(PartnerService),
    i18nService: inject(I18nService),
  })),
  withProps((store) => ({
    i18n: store.i18nService.translateAll(PARTNER_I18N_KEYS),
  })),
  withProps((store) => ({
    partnersResource: rxResource({
      params: () => ({ currentUser: store.appStore.currentUser() }),
      stream: ({ params }) => store.partnerService.list().pipe(
        debugListLoaded<PartnerModel>('PartnerStore.partners', params.currentUser),
      ),
    }),
  })),

  withComputed((state) => ({
    partners: computed(() => state.partnersResource.value() ?? []),
    isLoading: computed(() => state.partnersResource.isLoading()),
    currentUser: computed(() => state.appStore.currentUser()),
    tenantId: computed(() => state.appStore.tenantId()),
  })),

  withComputed((state) => ({
    filteredPartners: computed(() =>
      state.partners().filter(p => nameMatches(p.index, state.searchTerm())),
    ),
  })),

  withMethods((store) => ({
    setSearchTerm(searchTerm: string) { patchState(store, { searchTerm }); },

    reload() { store.partnersResource.reload(); },

    async add(): Promise<void> {
      if (!store.currentUser()) return;
      await this.edit(newPartnerModel(store.tenantId()), false);
    },

    async edit(partner: PartnerModel, readOnly = true): Promise<void> {
      const modal = await store.modalController.create({
        component: PartnerEditModal,
        componentProps: { partner, currentUser: store.currentUser(), readOnly },
      });
      modal.present();
      const { data, role } = await modal.onDidDismiss();
      if (role === 'confirm' && data && !readOnly) {
        if (data.okey?.length === 0) await store.partnerService.create(data, store.currentUser());
        else await store.partnerService.update(data, store.currentUser());
        this.reload();
      }
    },

    async delete(partner?: PartnerModel): Promise<void> {
      if (!partner) return;
      const result = await store.alertService.confirm(store.i18n.delete_confirm(), true);
      if (result === true) {
        await store.partnerService.delete(partner, store.currentUser());
        this.reload();
      }
    },
  })),
);

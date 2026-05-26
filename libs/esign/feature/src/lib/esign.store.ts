// libs/esign/feature/src/lib/esign.store.ts
import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController, ToastController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { AppStore } from '@bk2/shared-feature';
import { I18nService } from '@bk2/shared-i18n';
import { EsignDocumentStatus, EsignRecord } from '@bk2/shared-models';
import { EsignService } from '@bk2/esign-data-access';

import { PFX } from './scope';

const ESIGN_I18N_KEYS = {
  list_title:      PFX + 'list.title',
  empty:           PFX + 'empty',
  ok:              '@ok',
  cancel:          '@cancel',
  delete_error:    PFX + 'delete.error',
  send_error:      PFX + 'send.error',
  upload_error:    PFX + 'upload.error',
  scan_no_fields:  PFX + 'scan.no_fields',
  as_view:         PFX + 'actionsheet.view',
  as_doc_view:     PFX + 'actionsheet.doc_view',
  as_doc_share:    PFX + 'actionsheet.doc_share',
  as_doc_send:     PFX + 'actionsheet.doc_send',
  as_delete:       PFX + 'actionsheet.delete',
} satisfies Record<string, string>;

export type EsignI18n = { [K in keyof typeof ESIGN_I18N_KEYS]: import('@angular/core').Signal<string> };

type StatusFilter = EsignDocumentStatus | 'all';

interface EsignState {
  searchTerm:   string;
  statusFilter: StatusFilter;
}

export const EsignStore = signalStore(
  withProps(() => ({
    i18nService:     inject(I18nService),
    esignService:    inject(EsignService),
    appStore:        inject(AppStore),
    modalController: inject(ModalController),
    toastController: inject(ToastController),
  })),
  withProps(store => ({
    i18n: store.i18nService.translateAll(ESIGN_I18N_KEYS) as EsignI18n,
  })),
  withState<EsignState>({
    searchTerm:   '',
    statusFilter: 'all',
  }),
  withProps(store => ({
    _esigns: rxResource({
      params: () => ({ tenantId: store.appStore.tenantId() }),
      stream: () => store.esignService.list(),
    }),
  })),
  withComputed(store => ({
    isLoading: computed(() => store._esigns.isLoading()),
    filteredEsigns: computed(() => {
      const all    = (store._esigns.value() ?? []) as EsignRecord[];
      const filter = store.statusFilter();
      const term   = store.searchTerm().toLowerCase();
      return all
        .filter(e => filter === 'all' || e.documentStatus === filter)
        .filter(e => !term || e.documentName.toLowerCase().includes(term));
    }),
  })),
  withMethods(store => ({
    setSearchTerm(term: string): void {
      patchState(store, { searchTerm: term });
    },

    setStatusFilter(filter: StatusFilter): void {
      patchState(store, { statusFilter: filter });
    },

    async openViewModal(esign: EsignRecord): Promise<void> {
      const { EsignViewModal } = await import('./esign-view.modal');
      const modal = await store.modalController.create({
        component: EsignViewModal,
        componentProps: { esign },
      });
      await modal.present();
    },

    async openDeleteConfirm(esign: EsignRecord): Promise<void> {
      const { EsignDeleteConfirmModal } = await import('./esign-delete-confirm.modal');
      const modal = await store.modalController.create({
        component: EsignDeleteConfirmModal,
        componentProps: { esign },
      });
      await modal.present();
      const { role } = await modal.onWillDismiss();
      if (role !== 'confirm') return;
      try {
        await store.esignService.deleteEsign(esign.esignId);
      } catch {
        const toast = await store.toastController.create({
          message: store.i18n.delete_error(),
          duration: 3000,
          color: 'danger',
        });
        await toast.present();
      }
    },
  }))
);

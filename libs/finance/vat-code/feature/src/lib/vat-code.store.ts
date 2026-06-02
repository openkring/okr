import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { AppStore } from '@bk2/shared-feature';
import { I18nService } from '@bk2/shared-i18n';
import { VatCodeModel } from '@bk2/shared-models';

import { AccountingStore } from '@bk2/finance-accounting-feature';
import { VatCodeService } from '@bk2/finance-vat-code-data-access';
import { VAT_CODE_I18N_KEYS, VatCodeI18n } from '@bk2/finance-vat-code-util';

import { VatCodeEditModal } from './vat-code-edit.modal';

export const VatCodeStore = signalStore(
  withState({}),
  withProps(() => ({
    vatCodeService: inject(VatCodeService),
    accountingStore: inject(AccountingStore),
    appStore: inject(AppStore),
    modalController: inject(ModalController),
    i18nService: inject(I18nService),
  })),
  withProps(store => ({
    i18n: store.i18nService.translateAll(VAT_CODE_I18N_KEYS),
    vatCodesResource: rxResource({
      stream: () => store.vatCodeService.list(store.accountingStore.accountingTenantId()),
    }),
  })),
  withComputed(store => ({
    vatCodes: computed(() => store.vatCodesResource.value() ?? []),
    isLoading: computed(() => store.vatCodesResource.isLoading()),
    currentUser: computed(() => store.appStore.currentUser()),
    isReadOnly: computed(() => store.accountingStore.isExternallyManaged()),
    accountingTenantId: computed(() => store.accountingStore.accountingTenantId()),
  })),
  withMethods(store => ({
    async openEdit(vatCode: VatCodeModel, readOnly = true): Promise<void> {
      const modal = await store.modalController.create({
        component: VatCodeEditModal,
        componentProps: { vatCode, readOnly, currentUser: store.currentUser() },
      });
      modal.present();
      const { data, role } = await modal.onDidDismiss();
      if (role === 'confirm' && data && !store.isReadOnly()) {
        const code = data as VatCodeModel;
        if (code.bkey?.length > 0) {
          await store.vatCodeService.update(code, store.currentUser());
        } else {
          await store.vatCodeService.create(code, store.currentUser());
        }
        store.vatCodesResource.reload();
      }
    },

    async openCreate(): Promise<void> {
      if (store.isReadOnly()) return;
      const tenantId = store.appStore.tenantId();
      const accountingTenantId = store.accountingTenantId();
      const code = new VatCodeModel(tenantId, accountingTenantId);
      await this.openEdit(code, false);
    },

    async delete(vatCode: VatCodeModel): Promise<void> {
      if (store.isReadOnly()) return;
      await store.vatCodeService.delete(vatCode, store.currentUser());
      store.vatCodesResource.reload();
    },

    async seedStandard(): Promise<void> {
      if (store.isReadOnly()) return;
      const tenantId = store.appStore.tenantId();
      await store.vatCodeService.seedStandardCodes(tenantId, store.accountingTenantId(), store.currentUser());
      store.vatCodesResource.reload();
    },
  }))
);

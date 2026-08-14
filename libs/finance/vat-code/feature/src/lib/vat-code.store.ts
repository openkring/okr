import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { of } from 'rxjs';

import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { VatCodeModel } from '@okr/shared-models';

import { AccountService } from '@okr/finance-account-data-access';
import { AccountingStore } from '@okr/finance-accounting-feature';
import { VatCodeService } from '@okr/finance-vat-code-data-access';
import { VAT_CODE_I18N_KEYS, VatCodeI18n } from '@okr/finance-vat-code-util';

import { VatCodeEditModal } from './vat-code-edit.modal';

export const VatCodeStore = signalStore(
  withState({}),
  withProps(() => ({
    vatCodeService: inject(VatCodeService),
    accountService: inject(AccountService),
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
    // The account picker in the edit modal books a VAT code to an account okey (USt -> 2200, VST -> 1170).
    accountsResource: rxResource({
      params: () => store.accountingStore.accountingTenantId(),
      stream: ({ params: accountingTenantId }) =>
        accountingTenantId ? store.accountService.list(accountingTenantId) : of([]),
    }),
  })),
  withComputed(store => ({
    vatCodes: computed(() => store.vatCodesResource.value() ?? []),
    accounts: computed(() => store.accountsResource.value() ?? []),
    isLoading: computed(() => store.vatCodesResource.isLoading()),
    currentUser: computed(() => store.appStore.currentUser()),
    isReadOnly: computed(() => store.accountingStore.isExternallyManaged()),
    accountingTenantId: computed(() => store.accountingStore.accountingTenantId()),
  })),
  withMethods(store => ({
    async openEdit(vatCode: VatCodeModel, readOnly = true): Promise<void> {
      const modal = await store.modalController.create({
        component: VatCodeEditModal,
        componentProps: { vatCode, readOnly, currentUser: store.currentUser(), accounts: store.accounts() },
      });
      modal.present();
      const { data, role } = await modal.onDidDismiss();
      if (role === 'confirm' && data && !store.isReadOnly()) {
        const code = data as VatCodeModel;
        if (code.okey?.length > 0) {
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

import { computed, inject, Signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { AppStore } from '@bk2/shared-feature';
import { I18nService } from '@bk2/shared-i18n';
import { VatCodeModel } from '@bk2/shared-models';

import { AccountingStore } from '@bk2/finance-accounting-feature';
import { VatCodeService } from '@bk2/finance-vat-code-data-access';

import { VatCodeEditModal } from './vat-code-edit.modal';
import { PFX } from './scope';

const VAT_CODE_I18N_KEYS = {
  list_title: PFX + 'list.title',
  empty:      PFX + 'empty',
  code_label: PFX + 'code.label',
  rate_label: PFX + 'rate.label',
  as_view:    PFX + 'actionsheet.view',
  as_edit:    PFX + 'actionsheet.edit',
  as_create:  PFX + 'actionsheet.create',
  as_delete:  PFX + 'actionsheet.delete',
  save:       '@save.label',
  cancel:     '@cancel',
  seed_label: PFX + 'seed.label',
} satisfies Record<string, string>;

export type VatCodeI18n = { [K in keyof typeof VAT_CODE_I18N_KEYS]: Signal<string> };

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

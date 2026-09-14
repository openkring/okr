import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { of } from 'rxjs';

import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { BankProfileModel } from '@okr/shared-models';
import { resourceParams } from '@okr/shared-util-angular';

import { AccountService } from '@okr/finance-account-data-access';
import { AccountingStore } from '@okr/finance-accounting-feature';
import { leafAccounts } from '@okr/finance-account-util';
import { BankProfileService } from '@okr/finance-bank-profile-data-access';
import { BANK_PROFILE_I18N_KEYS } from '@okr/finance-bank-profile-util';

export const BankProfileStore = signalStore(
  withState({}),
  withProps(() => ({
    bankProfileService: inject(BankProfileService),
    accountService: inject(AccountService),
    accountingStore: inject(AccountingStore),
    appStore: inject(AppStore),
    modalController: inject(ModalController),
    i18nService: inject(I18nService),
  })),
  withProps(store => ({
    i18n: store.i18nService.translateAll(BANK_PROFILE_I18N_KEYS),
    profilesResource: rxResource({
      params: resourceParams(() => ({ id: store.accountingStore.accountingTenantId() })),
      stream: ({ params }) => params.id ? store.bankProfileService.list(params.id) : of([]),
    }),
    accountsResource: rxResource({
      params: resourceParams(() => ({ id: store.accountingStore.accountingTenantId() })),
      stream: ({ params }) => params.id ? store.accountService.list(params.id) : of([]),
    }),
  })),
  withComputed(store => ({
    profiles: computed(() => store.profilesResource.value() ?? []),
    isLoading: computed(() => store.profilesResource.isLoading()),
    accounts: computed(() => leafAccounts(store.accountsResource.value() ?? [])),
    currentUser: computed(() => store.appStore.currentUser()),
  })),
  withMethods(store => ({
    setAccountingTenant(id: string): void { store.accountingStore.setTenant(id); },

    async openEdit(profile: BankProfileModel, readOnly = true): Promise<BankProfileModel | undefined> {
      const { BankProfileEditModal } = await import('@okr/finance-bank-profile-ui');
      const modal = await store.modalController.create({
        component: BankProfileEditModal,
        componentProps: { profile, readOnly, accounts: store.accounts(), currentUser: store.currentUser() },
      });
      await modal.present();
      const { data, role } = await modal.onDidDismiss();
      if (role !== 'confirm' || !data) return undefined;
      const edited = data as BankProfileModel;
      if (edited.okey?.length > 0) {
        await store.bankProfileService.update(edited, store.currentUser());
      } else {
        const key = await store.bankProfileService.create(edited, store.currentUser());
        if (key) edited.okey = key;
      }
      return edited;
    },

    async openCreate(): Promise<void> {
      await this.openEdit(new BankProfileModel(store.appStore.tenantId(), store.accountingStore.accountingTenantId()), false);
    },

    async delete(profile: BankProfileModel): Promise<void> {
      await store.bankProfileService.delete(profile, store.currentUser());
    },
  })),
);

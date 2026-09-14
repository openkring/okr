import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { of } from 'rxjs';

import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { BankRuleModel } from '@okr/shared-models';
import { resourceParams } from '@okr/shared-util-angular';

import { AccountService } from '@okr/finance-account-data-access';
import { AccountingStore } from '@okr/finance-accounting-feature';
import { leafAccounts } from '@okr/finance-account-util';
import { VatCodeService } from '@okr/finance-vat-code-data-access';
import { BankRuleService } from '@okr/finance-bank-rule-data-access';
import { BANK_RULE_I18N_KEYS, normalizeRuleForSave } from '@okr/finance-bank-rule-util';

export const BankRuleStore = signalStore(
  withState({}),
  withProps(() => ({
    bankRuleService: inject(BankRuleService),
    accountService: inject(AccountService),
    vatCodeService: inject(VatCodeService),
    accountingStore: inject(AccountingStore),
    appStore: inject(AppStore),
    modalController: inject(ModalController),
    i18nService: inject(I18nService),
  })),
  withProps(store => ({
    i18n: store.i18nService.translateAll(BANK_RULE_I18N_KEYS),
    rulesResource: rxResource({
      params: resourceParams(() => ({ id: store.accountingStore.accountingTenantId() })),
      stream: ({ params }) => params.id ? store.bankRuleService.list(params.id) : of([]),
    }),
    accountsResource: rxResource({
      params: resourceParams(() => ({ id: store.accountingStore.accountingTenantId() })),
      stream: ({ params }) => params.id ? store.accountService.list(params.id) : of([]),
    }),
    vatCodesResource: rxResource({
      params: resourceParams(() => ({ id: store.accountingStore.accountingTenantId() })),
      stream: ({ params }) => params.id ? store.vatCodeService.list(params.id) : of([]),
    }),
  })),
  withComputed(store => ({
    rules: computed(() => store.rulesResource.value() ?? []),
    isLoading: computed(() => store.rulesResource.isLoading()),
    accounts: computed(() => leafAccounts(store.accountsResource.value() ?? [])),
    vatCodes: computed(() => store.vatCodesResource.value() ?? []),
    currentUser: computed(() => store.appStore.currentUser()),
  })),
  withMethods(store => ({
    setAccountingTenant(id: string): void { store.accountingStore.setTenant(id); },

    async openEdit(rule: BankRuleModel, readOnly = true): Promise<BankRuleModel | undefined> {
      const { BankRuleEditModal } = await import('@okr/finance-bank-rule-ui');
      const modal = await store.modalController.create({
        component: BankRuleEditModal,
        componentProps: { rule, readOnly, accounts: store.accounts(), vatCodes: store.vatCodes(), currentUser: store.currentUser() },
      });
      await modal.present();
      const { data, role } = await modal.onDidDismiss();
      if (role !== 'confirm' || !data) return undefined;
      const edited = normalizeRuleForSave(data as BankRuleModel);
      if (edited.okey?.length > 0) {
        await store.bankRuleService.update(edited, store.currentUser());
      } else {
        const key = await store.bankRuleService.create(edited, store.currentUser());
        if (key) edited.okey = key;
      }
      return edited;
    },

    async openCreate(seed?: Partial<BankRuleModel>): Promise<BankRuleModel | undefined> {
      const rule = Object.assign(new BankRuleModel(store.appStore.tenantId(), store.accountingStore.accountingTenantId()), seed ?? {});
      return await this.openEdit(rule, false);
    },

    async delete(rule: BankRuleModel): Promise<void> {
      await store.bankRuleService.delete(rule, store.currentUser());
    },
  })),
);

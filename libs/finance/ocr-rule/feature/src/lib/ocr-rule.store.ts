import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { of } from 'rxjs';

import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { OcrRuleModel } from '@okr/shared-models';
import { downloadTextFile } from '@okr/shared-util-angular';

import { AccountingStore } from '@okr/finance-accounting-feature';
import { AccountService } from '@okr/finance-account-data-access';
import { AccountStore } from '@okr/finance-account-feature';
import { VatCodeService } from '@okr/finance-vat-code-data-access';
import { OcrRuleService } from '@okr/finance-ocr-rule-data-access';
import { OCR_RULE_I18N_KEYS, leafAccounts, normalizeParty } from '@okr/finance-ocr-rule-util';

import { OcrRuleEditModal } from './ocr-rule-edit.modal';

export const OcrRuleStore = signalStore(
  withState({}),
  withProps(() => ({
    ocrRuleService: inject(OcrRuleService),
    accountService: inject(AccountService),
    accountStore: inject(AccountStore),
    vatCodeService: inject(VatCodeService),
    accountingStore: inject(AccountingStore),
    appStore: inject(AppStore),
    modalController: inject(ModalController),
    i18nService: inject(I18nService),
  })),
  withProps(store => ({
    i18n: store.i18nService.translateAll(OCR_RULE_I18N_KEYS),
    rulesResource: rxResource({
      stream: () => store.ocrRuleService.list(),
    }),
    accountsResource: rxResource({
      stream: () => {
        const id = store.accountingStore.accountingTenantId();
        return id ? store.accountService.list(id) : of([]);
      },
    }),
    vatCodesResource: rxResource({
      stream: () => {
        const id = store.accountingStore.accountingTenantId();
        return id ? store.vatCodeService.list(id) : of([]);
      },
    }),
  })),
  withComputed(store => ({
    // Coalesce aliases at the read boundary: Firestore reads skip model defaults, so a hand-seeded
    // rule doc may omit `aliases` — guaranteeing it here keeps template access (`rule.aliases.length`) safe.
    rules: computed(() => (store.rulesResource.value() ?? []).map(r => ({ ...r, aliases: r.aliases ?? [] }))),
    isLoading: computed(() => store.rulesResource.isLoading()),
    accounts: computed(() => leafAccounts(store.accountsResource.value() ?? [])),
    vatCodes: computed(() => store.vatCodesResource.value() ?? []),
    currentUser: computed(() => store.appStore.currentUser()),
    // OCR rules are LOCAL config (vendor→account mapping for the OCR pipeline), not data synced
    // from an external ledger — so rule editing is never gated by this. It is used only to open the
    // (Bexio-synced) chart-of-accounts editor read-only.
    accountingExternallyManaged: computed(() => store.accountingStore.isExternallyManaged()),
  })),
  withMethods(store => ({
    setAccountingTenant(id: string): void {
      store.accountingStore.setTenant(id);
    },

    async openEdit(rule: OcrRuleModel, readOnly = true): Promise<void> {
      const modal = await store.modalController.create({
        component: OcrRuleEditModal,
        componentProps: { rule, readOnly, accounts: store.accounts(), vatCodes: store.vatCodes() },
      });
      modal.present();
      const { data, role } = await modal.onDidDismiss();
      if (role === 'confirm' && data) {
        const edited = data as OcrRuleModel;
        edited.party = normalizeParty(edited.party);
        edited.aliases = (edited.aliases ?? []).map(a => normalizeParty(a)).filter(a => a.length > 0);
        if (edited.okey?.length > 0) {
          await store.ocrRuleService.update(edited, store.currentUser());
        } else {
          await store.ocrRuleService.create(edited, store.currentUser());
        }
        store.rulesResource.reload();
      }
    },

    async openCreate(): Promise<void> {
      const rule = new OcrRuleModel(store.appStore.tenantId());
      await this.openEdit(rule, false);
    },

    async delete(rule: OcrRuleModel): Promise<void> {
      await store.ocrRuleService.delete(rule, store.currentUser());
      store.rulesResource.reload();
    },

    /**
     * Open the chart-of-accounts editor for the account this rule books to. The account itself is
     * read-only when the ledger is externally managed (it is synced from e.g. Bexio, not editable here).
     */
    async editBookingAccount(rule: OcrRuleModel): Promise<void> {
      const account = store.accountStore.accounts().find(a => a.okey === rule.accountKey);
      if (!account) return; // rule has no (resolvable) account — nothing to edit
      await store.accountStore.edit(account, store.accountingExternallyManaged());
    },

    /** Download all rules of the current tenant as a pretty-printed JSON file. */
    async export(): Promise<void> {
      await downloadTextFile(JSON.stringify(store.rules(), null, 2), 'ocr-rules.json');
    },
  })),
);

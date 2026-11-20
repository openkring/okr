import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { AlertController, ModalController, ToastController } from '@ionic/angular';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { firstValueFrom, of } from 'rxjs';
import { take } from 'rxjs/operators';

import { AccountService } from '@okr/finance-account-data-access';
import { AccountingStore } from '@okr/finance-accounting-feature';
import { CostCenterService } from '@okr/finance-cost-center-data-access';
import { TrainerBillingService } from '@okr/finance-trainer-billing-data-access';
import {
  isAgreementActiveOn, rejectReasonOf, TRAINER_BILLING_I18N_KEYS, TrainerBillingI18n, trainerBillingRefusal, trainerBillingRefusalKey, trainerNameOf,
} from '@okr/finance-trainer-billing-util';
import { VatCodeService } from '@okr/finance-vat-code-data-access';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { AccountModel, CostCenterModel, TrainerAgreementModel, TrainerInvoiceModel, VatCodeModel } from '@okr/shared-models';
import { confirm, downloadFile, okrPrompt, resourceParams, showToast } from '@okr/shared-util-angular';
import { fill, getTodayStr, nameMatches } from '@okr/shared-util-core';

export type TrainerSegment = 'agreements' | 'invoices';

export type TrainerAgreementState = {
  listId: string;         // 'all' | personKey of one trainer
  searchTerm: string;
  segment: TrainerSegment;
  busy: boolean;          // a callable runs: no second click (Review Focus 2)
};

const initialState: TrainerAgreementState = {
  listId: 'all',
  searchTerm: '',
  segment: 'agreements',
  busy: false,
};

/**
 * The treasurer's page «Trainer» (spec 1.167 §7.1, §7.5): the agreements and the trainer invoices of ONE set of books.
 * The books come from the route (`accounting/:accountingTenantId/trainers/…`, set into the root AccountingStore by the
 * accounting shell) — never from the app tenant. The edit modal is `import()`ed (lazy-loading skill): the ui barrel stays
 * out of this chunk until the treasurer opens it, and the modal never imports this store back.
 */
export const TrainerAgreementStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    accountingStore: inject(AccountingStore),
    trainerBillingService: inject(TrainerBillingService),
    accountService: inject(AccountService),
    costCenterService: inject(CostCenterService),
    vatCodeService: inject(VatCodeService),
    modalController: inject(ModalController),
    alertController: inject(AlertController),
    toastController: inject(ToastController),
    router: inject(Router),
    i18nService: inject(I18nService),
  })),
  withProps((store) => ({
    i18n: store.i18nService.translateAll(TRAINER_BILLING_I18N_KEYS) as TrainerBillingI18n,
    /** the name of a person of this tenant (AppStore), for invoices whose agreement is archived and so not listed */
    personName: (personKey: string): string => {
      const person = store.appStore.getPerson(personKey);
      return person ? `${person.firstName ?? ''} ${person.lastName ?? ''}`.trim() : '';
    },
    // keyed by the user's identity, not the live user object (a new reference on every snapshot would restart the read)
    agreementsResource: rxResource({
      params: resourceParams(() => ({ userKey: store.appStore.currentUser()?.okey ?? '', books: store.accountingStore.accountingTenantId() })),
      stream: ({ params }) => params.userKey && params.books ? store.trainerBillingService.listAgreements(params.books) : of([]),
    }),
    invoicesResource: rxResource({
      params: resourceParams(() => ({ userKey: store.appStore.currentUser()?.okey ?? '', books: store.accountingStore.accountingTenantId() })),
      stream: ({ params }) => params.userKey && params.books ? store.trainerBillingService.invoicesOfBooks(params.books) : of([]),
    }),
  })),

  withComputed((store) => ({
    agreements: computed(() => store.agreementsResource.value() ?? []),
    invoices: computed(() => store.invoicesResource.value() ?? []),
    isLoading: computed(() => store.agreementsResource.isLoading() || store.invoicesResource.isLoading()),
    currentUser: computed(() => store.appStore.currentUser()),
    books: computed(() => store.accountingStore.accountingTenantId()),
    backend: computed(() => store.accountingStore.config()?.accountingBackend),
  })),

  withComputed((store) => ({
    filteredAgreements: computed(() => {
      const listId = store.listId();
      const term = store.searchTerm().toLowerCase();
      return store.agreements()
        .filter(a => listId === 'all' || (a.personKey ?? '') === listId)
        .filter(a => !term || nameMatches(a.index ?? '', term));
    }),
    filteredInvoices: computed(() => {
      const listId = store.listId();
      const term = store.searchTerm().toLowerCase();
      const agreements = store.agreements();
      return store.invoices()
        .filter(i => listId === 'all' || (i.personKey ?? '') === listId)
        .filter(i => !term || `${trainerNameOf(i, agreements, store.personName)} ${i.invoiceNo ?? ''} ${i.month ?? ''}`.toLowerCase().includes(term));
    }),
  })),

  withMethods((store) => ({
    /******************************** setters ******************************************* */
    setListId(listId: string): void {
      patchState(store, { listId: listId || 'all' });
    },
    setSearchTerm(searchTerm: string): void {
      patchState(store, { searchTerm });
    },
    setSegment(segment: TrainerSegment): void {
      patchState(store, { segment });
    },

    /******************************** getters ******************************************* */
    isActive(agreement: TrainerAgreementModel): boolean {
      return isAgreementActiveOn(agreement, getTodayStr());
    },
    trainerName(invoice: TrainerInvoiceModel): string {
      return trainerNameOf(invoice, store.agreements(), store.personName);
    },

    /******************************** agreements ******************************************* */
    /** A new agreement in the books of the route, valid from today, self-employment not yet confirmed (D9). */
    async add(): Promise<void> {
      const books = store.books();
      if (!books) return;
      const agreement = new TrainerAgreementModel(store.appStore.tenantId());
      agreement.accountingTenantId = books;
      agreement.validFrom = getTodayStr();
      await this.edit(agreement);
    },

    /**
     * Open the editor with what the books offer: accounts, cost centres (none in external books, like the bill editor),
     * VAT codes, the default compensation account, and every agreement of the books (the form checks the overlap per
     * person). Saves on `confirm`.
     */
    async edit(agreement: TrainerAgreementModel): Promise<void> {
      // busy while the lists load and the modal is open: a double tap must not open two editors
      await this.whileBusy(() => this.openEditor(agreement));
    },

    async openEditor(agreement: TrainerAgreementModel): Promise<void> {
      const books = agreement.accountingTenantId || store.books();
      if (!books) return;
      const [accounts, costCenters, vatCodes] = await Promise.all([
        store.accountService.listOnce(books).catch((e): AccountModel[] => { console.error('TrainerAgreementStore.edit: loading the accounts failed', e); return []; }),
        store.accountingStore.isExternallyManaged()
          ? Promise.resolve([] as CostCenterModel[])
          : firstValueFrom(store.costCenterService.list(books).pipe(take(1)))
              .catch((e): CostCenterModel[] => { console.error('TrainerAgreementStore.edit: loading the cost centres failed', e); return []; }),
        store.vatCodeService.listOnce(books).catch((e): VatCodeModel[] => { console.error('TrainerAgreementStore.edit: loading the VAT codes failed', e); return []; }),
      ]);
      const { TrainerAgreementEditModal } = await import('@okr/finance-trainer-billing-ui');
      const modal = await store.modalController.create({
        component: TrainerAgreementEditModal,
        componentProps: {
          agreement,
          currentUser: store.currentUser(),
          accounts,
          costCenters,
          vatCodes,
          defaultAccountKey: store.accountingStore.config()?.defaultCompensationAccountKey ?? '',
          otherAgreements: store.agreements(),
        },
      });
      await modal.present();
      const { data, role } = await modal.onDidDismiss<TrainerAgreementModel>();
      if (role !== 'confirm' || !data) return;
      await store.trainerBillingService.saveAgreement({ ...data, accountingTenantId: books }, store.currentUser());
    },

    /** Archive after a confirmation; its entries and invoices stay. */
    async archive(agreement: TrainerAgreementModel): Promise<void> {
      const name = `${agreement.person?.name1 ?? ''} ${agreement.person?.name2 ?? ''}`.trim();
      const ok = await confirm(store.alertController, fill(store.i18n.trainers_archive_confirm(), { name }),
        store.i18n.trainers_action_archive(), store.i18n.trainers_action_cancel(), true);
      if (!ok) return;
      await store.trainerBillingService.archiveAgreement(agreement, store.currentUser());
    },

    /******************************** trainer invoices ******************************************* */
    /** The PDF of a sent invoice, through the callable (finance-documents are private). */
    async download(invoice: TrainerInvoiceModel): Promise<void> {
      await this.whileBusy(async () => {
        const file = await store.trainerBillingService.download(invoice.okey);
        const url = URL.createObjectURL(file);
        try {
          await downloadFile(url, file instanceof File ? file.name : `${invoice.invoiceNo || invoice.okey}.pdf`);
        } finally {
          URL.revokeObjectURL(url);
        }
      }, store.i18n.trainers_download_error());
    },

    /** The Kreditor of the invoice in the bill list of the books (its `?billKey` opens the bill). */
    async toBill(invoice: TrainerInvoiceModel): Promise<void> {
      const books = invoice.accountingTenantId || store.books();
      if (!books || !invoice.billKey) return;
      await store.router.navigate(['/accounting', books, 'bill', 'all', 'c-bill'], { queryParams: { billKey: invoice.billKey } });
    },

    /** Reject a sent invoice with a reason (1–500 characters): its entries reopen, its draft bill goes (§7.5). */
    async reject(invoice: TrainerInvoiceModel): Promise<void> {
      const input = await okrPrompt(store.alertController, store.i18n.trainers_reject_title(), store.i18n.trainers_reject_placeholder(),
        store.i18n.trainers_action_reject(), store.i18n.trainers_action_cancel());
      if (input === undefined) return;
      const reason = rejectReasonOf(input);
      if (!reason) {
        await showToast(store.toastController, store.i18n.send_refusal_invalid_reason());
        return;
      }
      await this.whileBusy(async () => {
        await store.trainerBillingService.reject(invoice.okey, reason);
        await showToast(store.toastController, store.i18n.trainers_reject_conf());
      });
    },

    /** Mark a sent invoice paid — external (bexio) books only, where no Kreditor mirrors the state. */
    async markPaid(invoice: TrainerInvoiceModel): Promise<void> {
      const ok = await confirm(store.alertController, fill(store.i18n.trainers_markPaid_confirm(), { invoiceNo: invoice.invoiceNo ?? '' }),
        store.i18n.trainers_action_markPaid(), store.i18n.trainers_action_cancel(), true);
      if (!ok) return;
      await this.whileBusy(async () => {
        await store.trainerBillingService.markPaid(invoice.okey);
        await showToast(store.toastController, store.i18n.trainers_markPaid_conf());
      });
    },

    /**
     * Run one callable at a time; a refusal of the server is shown as its message, any other error as `fallback`
     * (or the generic refusal message).
     */
    async whileBusy(action: () => Promise<void>, fallback?: string): Promise<void> {
      if (store.busy()) return;
      patchState(store, { busy: true });
      try {
        await action();
      } catch (e) {
        console.error('TrainerAgreementStore: callable failed', e);
        const message = trainerBillingRefusal(e) || !fallback ? store.i18n[trainerBillingRefusalKey(e)]() : fallback;
        await showToast(store.toastController, message);
      } finally {
        patchState(store, { busy: false });
      }
    },
  })),
);

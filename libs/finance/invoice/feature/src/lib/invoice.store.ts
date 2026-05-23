import { computed, inject, Signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController, ModalController, ToastController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { getApp } from 'firebase/app';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { of } from 'rxjs';

import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore } from '@bk2/shared-feature';
import { InvoiceCollection, InvoiceModel } from '@bk2/shared-models';
import { confirm, exportXlsx } from '@bk2/shared-util-angular';
import { debugListLoaded, getSystemQuery, nameMatches } from '@bk2/shared-util-core';
import { I18nService } from '@bk2/shared-i18n';

import { InvoiceService } from '@bk2/finance-invoice-data-access';
import { getInvoiceExportData, newInvoice } from '@bk2/finance-invoice-util';

import { InvoiceEditModal } from './invoice-edit.modal';
import { InvoiceViewModal } from './invoice-view.modal';

import { PFX } from './scope';

const UI_PFX = '@finance/invoice/ui.';

const INVOICE_I18N_KEYS = {
  delete_confirm: PFX + 'delete.confirm',
  ok: '@ok',
  cancel: '@cancel',
  list_title:      '@finance.invoice.list.title',
  accordion_title: '@invoice.accordion.title',
  field_empty:     '@finance.invoice.field.empty',
  as_view:    PFX + 'actionsheet.view',
  as_showpdf: PFX + 'actionsheet.showpdf',
  as_edit:    PFX + 'actionsheet.edit',
  as_delete:  PFX + 'actionsheet.delete',
  // ChangeConfirmationI18n keys (used by modals)
  changeConfirmation_ok:           PFX + 'changeConfirmation.ok',
  changeConfirmation_cancel:       PFX + 'changeConfirmation.cancel',
  changeConfirmation_confirmation: PFX + 'changeConfirmation.confirmation',
  // InvoiceEditFormI18n keys
  invoiceId_label:          UI_PFX + 'invoiceId.label',
  invoiceId_placeholder:    UI_PFX + 'invoiceId.placeholder',
  invoiceId_helper:         UI_PFX + 'invoiceId.helper',
  title_label:              UI_PFX + 'title.label',
  title_placeholder:        UI_PFX + 'title.placeholder',
  title_helper:             UI_PFX + 'title.helper',
  amount_label:             UI_PFX + 'amount.label',
  amount_placeholder:       UI_PFX + 'amount.placeholder',
  amount_helper:            UI_PFX + 'amount.helper',
  notes_label:              UI_PFX + 'notes.label',
  notes_placeholder:        UI_PFX + 'notes.placeholder',
  invoiceDate_label:        UI_PFX + 'invoiceDate.label',
  invoiceDate_placeholder:  UI_PFX + 'invoiceDate.placeholder',
  invoiceDate_helper:       UI_PFX + 'invoiceDate.helper',
  dueDate_label:            UI_PFX + 'dueDate.label',
  dueDate_placeholder:      UI_PFX + 'dueDate.placeholder',
  dueDate_helper:           UI_PFX + 'dueDate.helper',
  paymentDate_label:        UI_PFX + 'paymentDate.label',
  paymentDate_placeholder:  UI_PFX + 'paymentDate.placeholder',
  paymentDate_helper:       UI_PFX + 'paymentDate.helper',
  vatType_label:            UI_PFX + 'vatType.label',
  state_label:              UI_PFX + 'state.label',
  // BexioInvoiceNewFormI18n keys
  bexioId_label:            UI_PFX + 'bexioId.label',
  bexioId_placeholder:      UI_PFX + 'bexioId.placeholder',
  bexioId_helper:           UI_PFX + 'bexioId.helper',
  posText_label:            UI_PFX + 'position.text.label',
  posText_placeholder:      UI_PFX + 'position.text.placeholder',
  posText_helper:           UI_PFX + 'position.text.helper',
  unitPrice_label:          UI_PFX + 'position.unitPrice.label',
  unitPrice_placeholder:    UI_PFX + 'position.unitPrice.placeholder',
  unitPrice_helper:         UI_PFX + 'position.unitPrice.helper',
  posAmount_label:          UI_PFX + 'position.amount.label',
  posAmount_placeholder:    UI_PFX + 'position.amount.placeholder',
  posAmount_helper:         UI_PFX + 'position.amount.helper',
  accountId_label:          UI_PFX + 'position.accountId.label',
  accountId_placeholder:    UI_PFX + 'position.accountId.placeholder',
  accountId_helper:         UI_PFX + 'position.accountId.helper',
  header_label:             UI_PFX + 'header.label',
  header_placeholder:       UI_PFX + 'header.placeholder',
  header_title:             UI_PFX + 'field.header.label',
  footer_label:             UI_PFX + 'footer.label',
  footer_placeholder:       UI_PFX + 'footer.placeholder',
  footer_title:             UI_PFX + 'field.footer.label',
  validFrom_label:          UI_PFX + 'validFrom.label',
  validFrom_placeholder:    UI_PFX + 'validFrom.placeholder',
  validFrom_helper:         UI_PFX + 'validFrom.helper',
  validTo_label:            UI_PFX + 'validTo.label',
  validTo_placeholder:      UI_PFX + 'validTo.placeholder',
  validTo_helper:           UI_PFX + 'validTo.helper',
  template_label:           UI_PFX + 'template.label',
  defaultPosition_label:    UI_PFX + 'defaultPosition.label',
} satisfies Record<string, string>;

export type InvoiceI18n = { [K in keyof typeof INVOICE_I18N_KEYS]: Signal<string> };

export type InvoiceState = {
  listId: string;         // 'all' | 'my' | personKey
  searchTerm: string;
  selectedState: string;  // 'all' | 'draft' | 'pending' | 'paid' | 'cancelled'
  version: number;
};

const initialState: InvoiceState = {
  listId: 'all',
  searchTerm: '',
  selectedState: 'all',
  version: 0,
};

export const InvoiceStore = signalStore(
  withState(initialState),
  withProps((store) => {
    const appStore = inject(AppStore);
    const functions = getFunctions(getApp(), 'europe-west6');
    if (appStore.env.useEmulators) {
      connectFunctionsEmulator(functions, 'localhost', 5001);
    }
    return {
      invoiceService: inject(InvoiceService),
      appStore,
      firestoreService: inject(FirestoreService),
      modalController: inject(ModalController),
      toastController: inject(ToastController),
      alertController: inject(AlertController),
      i18nService: inject(I18nService),
      functions,
    };
  }),

  withProps((store) => ({
    i18n: store.i18nService.translateAll(INVOICE_I18N_KEYS),

    allInvoicesResource: rxResource({
      params: () => ({
        currentUser: store.appStore.currentUser(),
        version: store.version(),
      }),
      stream: ({ params }) => {
        if (!params.currentUser) return of([]);
        return store.firestoreService.searchData<InvoiceModel>(
          InvoiceCollection,
          getSystemQuery(store.appStore.tenantId()),
          'invoiceDate',
          'desc'
        ).pipe(debugListLoaded('InvoiceStore.allInvoices', params.currentUser));
      },
    }),
  })),

  withComputed((store) => ({
    isLoading: computed(() => store.allInvoicesResource.isLoading()),
    currentUser: computed(() => store.appStore.currentUser()),

    filteredInvoices: computed(() => {
      const listId = store.listId();
      const searchTerm = store.searchTerm().toLowerCase();
      const selectedState = store.selectedState();
      const currentUser = store.appStore.currentUser();

      let invoices = store.allInvoicesResource.value() ?? [];

      // filter by listId
      if (listId === 'my') {
        const personKey = currentUser?.personKey;
        invoices = personKey ? invoices.filter(i => i.receiver?.key === personKey) : [];
      } else if (listId !== 'all') {
        invoices = invoices.filter(i => i.receiver?.key === listId);
      }

      // filter by state
      if (selectedState !== 'all') {
        invoices = invoices.filter(i => i.state === selectedState);
      }

      // filter by search term
      if (searchTerm) {
        invoices = invoices.filter(i => nameMatches(i.index, searchTerm));
      }

      return invoices;
    }),
  })),

  withMethods((store) => ({
    setListId(listId: string): void {
      patchState(store, { listId });
    },
    setSearchTerm(searchTerm: string): void {
      patchState(store, { searchTerm });
    },
    setSelectedState(selectedState: string): void {
      patchState(store, { selectedState });
    },

    async add(): Promise<void> {
      const invoice = newInvoice(store.appStore.tenantId());
      const modal = await store.modalController.create({
        component: InvoiceEditModal,
        componentProps: {
          invoice,
          currentUser: store.appStore.currentUser(),
          isNew: true,
          readOnly: false,
        },
      });
      await modal.present();
      const { data, role } = await modal.onWillDismiss<InvoiceModel>();
      if (role === 'confirm' && data) {
        await store.invoiceService.create(data, store.appStore.currentUser() ?? undefined);
        patchState(store, { version: store.version() + 1 });
      }
    },

    async edit(invoice: InvoiceModel, readOnly = false): Promise<void> {
      const modal = await store.modalController.create({
        component: InvoiceEditModal,
        componentProps: {
          invoice: { ...invoice },
          currentUser: store.appStore.currentUser(),
          isNew: false,
          readOnly,
        },
      });
      await modal.present();
      const { data, role } = await modal.onWillDismiss<InvoiceModel>();
      if (role === 'confirm' && data) {
        await store.invoiceService.update(data, store.appStore.currentUser() ?? undefined);
        patchState(store, { version: store.version() + 1 });
      }
    },

    async view(invoice: InvoiceModel): Promise<void> {
      const modal = await store.modalController.create({
        component: InvoiceViewModal,
        componentProps: {
          invoice: { ...invoice }
        },
      });
      await modal.present();
    },

    async delete(invoice: InvoiceModel): Promise<void> {
      const confirmed = await confirm(store.alertController, store.i18n.delete_confirm(), store.i18n.ok(), store.i18n.cancel(), true);
      if (!confirmed) return;
      await store.invoiceService.delete(invoice, store.appStore.currentUser() ?? undefined);
      patchState(store, { version: store.version() + 1 });
    },

    async export(type: string, invoices: InvoiceModel[]): Promise<void> {
      if (type === 'raw') {
        await exportXlsx(getInvoiceExportData(invoices), 'invoices.xlsx', 'Invoices');
      }
    },

    async showPdf(invoice: InvoiceModel): Promise<void> {
      const fn = httpsCallable<{ invoiceId: string }, { content: string }>(
        store.functions, 'showInvoicePdf'
      );
      const result = await fn({ invoiceId: invoice.bkey });
      const bytes = Uint8Array.from(atob(result.data.content), c => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${invoice.invoiceId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    },
  })),
);

export type InvoiceStore = InstanceType<typeof InvoiceStore>;

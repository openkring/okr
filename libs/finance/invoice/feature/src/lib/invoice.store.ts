import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController, ModalController, ToastController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { getApp } from 'firebase/app';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { firstValueFrom, of } from 'rxjs';
import { take } from 'rxjs/operators';

import { FirestoreService } from '@okr/shared-data-access';
import { AppStore } from '@okr/shared-feature';
import { InvoiceCollection, InvoiceModel, OrgModelName, PersonModelName } from '@okr/shared-models';
import { confirm, exportCsv, showToast } from '@okr/shared-util-angular';
import { debugListLoaded, fill, getSystemQuery, getTodayStr, getYear, nameMatches } from '@okr/shared-util-core';
import { I18nService } from '@okr/shared-i18n';

import { InvoiceService } from '@okr/finance-invoice-data-access';
import {
  buildPaymentConfirmationPayload, canCreatePaymentConfirmation, getInvoiceExportData, INVOICE_I18N_KEYS, InvoiceI18n,
  invoiceRefusalReasons, invoiceRefusalText, isDraftInvoice, newDraftInvoice, PAYMENT_CONFIRMATION_TEMPLATE_ID,
} from '@okr/finance-invoice-util';
import { AccountingStore } from '@okr/finance-accounting-feature';
import { ReceiptParty } from '@okr/finance-booking-util';
import { downloadFromUrl } from '@okr/finance-reporting-util';
import { DocGenerationService } from '@okr/content-pdf-template-data-access';
import { AddressService } from '@okr/subject-address-data-access';
import { getDirectoryPostalAddress, readsAddressVault } from '@okr/subject-address-util';
import { OrgService } from '@okr/subject-org-data-access';
import { PersonService } from '@okr/subject-person-data-access';

import { InvoiceEditModal, InvoiceEditResult } from './invoice-edit.modal';
import { MemberInvoiceService } from './member-invoice.service';

export type InvoiceState = {
  listId: string;         // 'all' | 'my' | personKey
  searchTerm: string;
  selectedState: string;  // 'all' | 'draft' | 'issuing' | 'pending' | 'paid' | 'cancelled'
  selectedYear: number;   // all is 99
  version: number;
};

const initialState: InvoiceState = {
  listId: 'all',
  searchTerm: '',
  selectedState: 'all',
  selectedYear: getYear(),
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
      memberInvoiceService: inject(MemberInvoiceService),
      addressService: inject(AddressService),
      personService: inject(PersonService),
      orgService: inject(OrgService),
      docGenerationService: inject(DocGenerationService),
      appStore,
      accountingStore: inject(AccountingStore),
      firestoreService: inject(FirestoreService),
      modalController: inject(ModalController),
      toastController: inject(ToastController),
      alertController: inject(AlertController),
      i18n: inject(I18nService).translateAll(INVOICE_I18N_KEYS) as InvoiceI18n,
      functions,
    };
  }),

  withProps((store) => ({
    allInvoicesResource: rxResource({
      params: () => ({
        currentUser: store.appStore.currentUser(),
        accountingTenantId: store.accountingStore.accountingTenantId(),
        listId: store.listId(),
        version: store.version(),
      }),
      stream: ({ params }) => {
        if (!params.currentUser || !params.accountingTenantId) return of([]);
        // The 'my' list constrains receiver.key SERVER-side, not only in
        // filteredInvoices: the invoices rule now grants a plain member read access
        // to their own invoices only, and Firestore validates a list request against
        // the query, not the rows it happens to return. Without this where-clause the
        // whole query is denied for anyone below treasurer. Privileged screens keep
        // the unconstrained query (their read passes via the isPrivileged branch).
        const personKey = params.currentUser.personKey;
        if (params.listId === 'my' && !personKey) return of([]);
        return store.firestoreService.searchData<InvoiceModel>(
          InvoiceCollection,
          [
            ...getSystemQuery(store.appStore.tenantId()),
            { key: 'accountingTenantId', operator: '==' as const, value: params.accountingTenantId },
            ...(params.listId === 'my'
              ? [{ key: 'receiver.key', operator: '==' as const, value: personKey }]
              : []),
          ],
          'invoiceDate',
          'desc'
        ).pipe(debugListLoaded('InvoiceStore.allInvoices', params.currentUser));
      },
    }),
  })),

  withComputed((store) => ({
    isLoading: computed(() => store.allInvoicesResource.isLoading()),
    currentUser: computed(() => store.appStore.currentUser()),
    isExternallyManaged: computed(() => store.accountingStore.isExternallyManaged()),
    states: computed(() => store.appStore.getCategory('invoice_state')),

    filteredInvoices: computed(() => {
      let invoices = store.allInvoicesResource.value() ?? [];

      // filter by listId
      const listId = store.listId();
      const currentUser = store.appStore.currentUser();
      if (listId === 'my') {
        const personKey = currentUser?.personKey;
        invoices = personKey ? invoices.filter(i => i.receiver?.key === personKey) : [];
      } else if (listId !== 'all') {
        invoices = invoices.filter(i => i.receiver?.key === listId);
      }

      // filter by state
      const selectedState = store.selectedState();
      if (selectedState !== 'all') {
        invoices = invoices.filter(i => i.state === selectedState);
      }

      // filter by year
      const selectedYear = store.selectedYear();
      if (selectedYear !== 99) {
        invoices = invoices.filter(i => i.invoiceDate.startsWith(selectedYear + ''));
      }

      // filter by search term
      const searchTerm = store.searchTerm().toLowerCase();
      if (searchTerm) {
        invoices = invoices.filter(i => nameMatches(i.index, searchTerm));
      }

      return invoices;
    }),
  })),

  withMethods((store) => ({     
    /******************************** setters (filter) ******************************************* */
    setListId(listId: string): void {
      patchState(store, { listId });
    },

    setSearchTerm(searchTerm: string): void {
      patchState(store, { searchTerm });
    },

    setSelectedState(selectedState: string): void {
      patchState(store, { selectedState });
    },

    setSelectedYear(selectedYear: number): void {
      patchState(store, { selectedYear });
    },

    /******************************** getters ******************************************* */

    /******************************** actions ******************************************* */
    async add(): Promise<void> {
      if (store.accountingStore.isExternallyManaged()) return;
      const invoice = newDraftInvoice(store.appStore.tenantId(), store.accountingStore.accountingTenantId(), getTodayStr());
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
      const { data, role } = await modal.onWillDismiss<InvoiceEditResult>();
      if (role === 'confirm' && data) {
        await store.memberInvoiceService.createDraft(data);
        patchState(store, { version: store.version() + 1 });
      }
    },

    /** Opens an invoice in the edit modal; it is editable only while it is a draft. */
    async edit(invoice: InvoiceModel, readOnly = false): Promise<void> {
      const modal = await store.modalController.create({
        component: InvoiceEditModal,
        componentProps: {
          invoice: { ...invoice },
          currentUser: store.appStore.currentUser(),
          isNew: false,
          readOnly: readOnly || !isDraftInvoice(invoice) || store.accountingStore.isExternallyManaged(),
        },
      });
      await modal.present();
      const { data, role } = await modal.onWillDismiss<InvoiceEditResult>();
      if (role === 'confirm' && data) {
        try {
          await store.invoiceService.update(data.invoice, data.positions, store.appStore.currentUser() ?? undefined);
          await showToast(store.toastController, store.i18n.update_conf());
        } catch (e) {
          console.error('InvoiceStore.edit: writeInvoice failed', e);
          await showToast(store.toastController, invoiceRefusalText(invoiceRefusalReasons(e), store.i18n, store.i18n.update_error()));
        }
        patchState(store, { version: store.version() + 1 });
      }
    },

    async view(invoice: InvoiceModel): Promise<void> {
      const { InvoiceViewModal } = await import('./invoice-view.modal');
      const modal = await store.modalController.create({
        component: InvoiceViewModal,
        componentProps: {
          invoice: { ...invoice }
        },
      });
      await modal.present();
    },

    /** Deletes a draft with its positions (the server refuses anything else). */
    async delete(invoice: InvoiceModel): Promise<void> {
      if (!isDraftInvoice(invoice)) return;
      const confirmed = await confirm(store.alertController, store.i18n.delete_confirm(), store.i18n.ok(), store.i18n.cancel(), true);
      if (!confirmed) return;
      try {
        await store.invoiceService.delete(invoice, store.appStore.currentUser() ?? undefined);
        await showToast(store.toastController, store.i18n.delete_conf());
      } catch (e) {
        console.error('InvoiceStore.delete: writeInvoice failed', e);
        await showToast(store.toastController, invoiceRefusalText(invoiceRefusalReasons(e), store.i18n, store.i18n.delete_error()));
      }
      patchState(store, { version: store.version() + 1 });
    },

    /**
     * Issues a draft (spec 1.76): it gets its number, its PDF and its Debitoren booking, and cannot be
     * changed afterwards — hence the confirmation. A refusal names its reason in a friendly toast.
     */
    async issue(invoice: InvoiceModel): Promise<void> {
      if (!isDraftInvoice(invoice)) return;
      const confirmed = await confirm(store.alertController, store.i18n.issue_confirm(), store.i18n.issue(), store.i18n.cancel(), true);
      if (!confirmed) return;
      try {
        const result = await store.invoiceService.issue(invoice.okey, store.appStore.currentUser() ?? undefined);
        await showToast(store.toastController, fill(store.i18n.issue_conf(), { invoiceId: String(result.invoiceNo) }));
      } catch (e) {
        console.error('InvoiceStore.issue: issueInvoice failed', e);
        await showToast(store.toastController, invoiceRefusalText(invoiceRefusalReasons(e), store.i18n, store.i18n.issue_error()));
      }
      patchState(store, { version: store.version() + 1 });
    },

    async export(type: string, invoices: InvoiceModel[]): Promise<void> {
      if (type === 'raw') {
        await exportCsv(getInvoiceExportData(invoices), 'invoices.xlsx', 'Invoices');
      }
    },

    async showPdf(invoice: InvoiceModel): Promise<void> {
      try {
        const fn = httpsCallable<{ invoiceId: string }, { content: string }>(
          store.functions, 'showInvoicePdf'
        );
        const result = await fn({ invoiceId: invoice.okey });
        const bytes = Uint8Array.from(atob(result.data.content), c => c.charCodeAt(0));
        const blob = new Blob([bytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${invoice.invoiceId}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      } catch (e) {
        // Without this the callable's rejection escapes as an unhandled promise
        // rejection: the user sees nothing at all, the failure only lands in Sentry
        // (SCS-A0). Bexio can be unreachable, and the callable still rejects for
        // anyone who is neither the recipient nor treasurer/privileged.
        console.error('InvoiceStore.showPdf: failed to fetch the PDF', e);
        const reason = (e as { details?: { reason?: string } })?.details?.reason;
        await showToast(store.toastController, reason === 'no-pdf' ? store.i18n.show_pdf_missing() : store.i18n.show_pdf_error());
      }
    },

    /**
     * Render the payment confirmation (templates/PAYMENT_CONFIRMATION_TEMPLATE_ID) for a paid
     * invoice and save it as PDF. The payload is built from the invoice, its receiver and the
     * receiver's favorite postal address; the payee is resolved by the Cloud Function.
     */
    async createPaymentConfirmation(invoice: InvoiceModel): Promise<void> {
      const receiver = invoice.receiver;
      if (!receiver || !canCreatePaymentConfirmation(invoice)) return;
      try {
        let party: ReceiptParty | undefined;
        if (receiver.modelType === 'person') {
          const person = await firstValueFrom(store.personService.read(receiver.key).pipe(take(1)));
          if (person) party = { kind: 'person', person };
        } else if (receiver.modelType === 'org') {
          const org = await firstValueFrom(store.orgService.read(receiver.key).pipe(take(1)));
          if (org) party = { kind: 'org', org };
        }
        if (!party) {
          await showToast(store.toastController, store.i18n.payment_confirmation_error());
          return;
        }
        // addresses.parentKey is modelType-prefixed ('person.<okey>' / 'org.<okey>').
        // Only the owner, privileged and memberAdmin read the raw vault; a treasurer gets the
        // member-visible postal address from the address-directory projection instead.
        const parentKey = `${party.kind === 'person' ? PersonModelName : OrgModelName}.${receiver.key}`;
        const address = readsAddressVault(store.appStore.currentUser(), parentKey)
          ? await firstValueFrom(store.addressService.getFavoritePostalAddress(parentKey).pipe(take(1)))
          : getDirectoryPostalAddress(store.appStore.getDirectoryEntry(parentKey)?.entries, store.appStore.tenantId(), parentKey);
        if (!address) {
          await showToast(store.toastController, store.i18n.payment_confirmation_noAddress());
          return;
        }

        const filename = `Zahlungsbestaetigung-${invoice.invoiceId || invoice.okey}.pdf`;
        const result = await store.docGenerationService.generate({
          templateId: PAYMENT_CONFIRMATION_TEMPLATE_ID,
          payload: buildPaymentConfirmationPayload(invoice, party, address),
          options: {
            outputFormat: 'pdf',
            storageMode: 'persist',
            filename,
            margin: { top: '0', right: '0', bottom: '0', left: '0' },
            metadata: { entityType: 'invoice', entityId: invoice.okey },
          },
        });
        // Fetch into a blob download: window.open this long after the action sheet closed is
        // no longer a user gesture and the browser blocks the tab silently.
        const saved = await downloadFromUrl(result.url, filename);
        if (!saved) window.open(result.url, '_blank');
      } catch (e) {
        console.error('InvoiceStore.createPaymentConfirmation: failed to generate the PDF', e);
        await showToast(store.toastController, store.i18n.payment_confirmation_error());
      }
    },
  })),
);

export type InvoiceStore = InstanceType<typeof InvoiceStore>;

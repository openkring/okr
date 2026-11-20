import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { AlertController, ModalController, ToastController } from '@ionic/angular';
import { patchState, signalStore, withComputed, withHooks, withMethods, withProps, withState } from '@ngrx/signals';
import { of } from 'rxjs';

import { TrainerBillingService } from '@okr/finance-trainer-billing-data-access';
import {
  agreementOfMonth, agreementsInMonth, defaultMonth, entryDefaultDate, isAgreementActiveOn, monthOf, monthTitleDe, openEntriesOf,
  shiftMonth, TRAINER_BILLING_I18N_KEYS, TrainerBillingI18n, trainerBillingRefusal, trainerBillingRefusalKey,
} from '@okr/finance-trainer-billing-util';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { TrainerAgreementModel, TrainerInvoiceModel, TrainerProfileModel, WorkEntryModel } from '@okr/shared-models';
import { confirm, downloadFile, resourceParams, showToast } from '@okr/shared-util-angular';
import { convertDateFormatToString, DateFormat, fill, getTodayStr } from '@okr/shared-util-core';

export type TrainerBillingState = {
  month: string;                                  // YYYY-MM shown
  books: string;                                  // chosen books ('' = the first the trainer has in the month)
  busy: boolean;                                  // a callable or a modal runs: no second click (Review Focus 2)
  profileDraft: TrainerProfileModel | undefined;  // unsaved «Rechnungsangaben» while the trainer adds an address
};

const initialState: TrainerBillingState = {
  month: '',                                      // set on init (defaultMonth of the day the page opens)
  books: '',
  busy: false,
  profileDraft: undefined,
};

/**
 * The trainer's page «Meine Abrechnung» (spec 1.167 §7.2–§7.4): the caller's own agreements, the entries of one month
 * (no amounts — only the preview PDF knows them), the invoice profile and the own trainer invoices. The person comes
 * from the current user, never from the route. The books come from the agreements, never from the app tenant.
 * The modals are `import()`ed (lazy-loading skill) and never import this store back.
 */
export const TrainerBillingStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    trainerBillingService: inject(TrainerBillingService),
    modalController: inject(ModalController),
    alertController: inject(AlertController),
    toastController: inject(ToastController),
    router: inject(Router),
    i18nService: inject(I18nService),
  })),
  withProps((store) => ({
    i18n: store.i18nService.translateAll(TRAINER_BILLING_I18N_KEYS) as TrainerBillingI18n,
    today: getTodayStr(),
  })),
  withComputed((store) => ({
    personKey: computed(() => store.appStore.currentUser()?.personKey ?? ''),
  })),
  withHooks({
    onInit(store) {
      patchState(store, { month: defaultMonth(store.today) });
    },
  }),
  withProps((store) => ({
    agreementsResource: rxResource({
      params: resourceParams(() => ({ personKey: store.personKey() })),
      stream: ({ params }) => store.trainerBillingService.myAgreements(params.personKey),
    }),
    entriesResource: rxResource({
      params: resourceParams(() => ({ personKey: store.personKey(), month: store.month() })),
      stream: ({ params }) => store.trainerBillingService.myEntries(params.personKey, params.month),
    }),
    invoicesResource: rxResource({
      params: resourceParams(() => ({ personKey: store.personKey() })),
      stream: ({ params }) => store.trainerBillingService.myInvoices(params.personKey),
    }),
    profileResource: rxResource({
      params: resourceParams(() => ({ personKey: store.personKey() })),
      stream: ({ params }) => store.trainerBillingService.readProfile(params.personKey),
    }),
  })),

  withComputed((store) => ({
    agreements: computed(() => store.agreementsResource.value() ?? []),
    allEntries: computed(() => store.entriesResource.value() ?? []),
    invoices: computed(() => store.invoicesResource.value() ?? []),
    isLoading: computed(() => store.agreementsResource.isLoading() || store.entriesResource.isLoading()),
    canGoNext: computed(() => store.month() < monthOf(store.today)),
    monthTitle: computed(() => monthTitleDe(store.month())),
  })),

  withComputed((store) => ({
    /** the agreements the trainer works under in the shown month (all books) */
    monthAgreements: computed(() => agreementsInMonth(store.agreements(), store.month())),
    /** an agreement active today or in the shown month; without one the page shows its empty state */
    hasActiveAgreement: computed(() =>
      store.agreements().some(a => isAgreementActiveOn(a, store.today)) || agreementsInMonth(store.agreements(), store.month()).length > 0),
  })),

  withComputed((store) => ({
    /** the books of the month's agreements; the switcher shows when there are several */
    booksList: computed(() => [...new Set(store.monthAgreements().map(a => a.accountingTenantId))].sort()),
    /** display names of all books the trainer has agreements or invoices in: the org of the books, else the id */
    booksLabels: computed(() => {
      const ids = new Set([...store.agreements().map(a => a.accountingTenantId), ...store.invoices().map(i => i.accountingTenantId)]);
      const labels: Record<string, string> = {};
      for (const id of ids) {
        if (id) labels[id] = store.appStore.getOrg(id)?.name || id.toUpperCase();
      }
      return labels;
    }),
  })),

  withComputed((store) => ({
    selectedBooks: computed(() => {
      const list = store.booksList();
      return list.includes(store.books()) ? store.books() : (list[0] ?? '');
    }),
  })),

  withComputed((store) => ({
    /** the agreement a preview or send of the month uses */
    agreement: computed(() => agreementOfMonth(store.agreements(), store.selectedBooks(), store.month())),
    /** the month's entries of the chosen books, open and invoiced */
    entries: computed(() => store.allEntries().filter(e => e.accountingTenantId === store.selectedBooks())),
    /** the books column of «Meine Rechnungen» is needed only with invoices of several books */
    showInvoiceBooks: computed(() => new Set(store.invoices().map(i => i.accountingTenantId)).size > 1),
  })),

  withComputed((store) => ({
    openEntries: computed(() => openEntriesOf(store.entries(), store.agreement()?.okey ?? '')),
  })),

  withProps((store) => ({
    eventNamesResource: rxResource({
      params: resourceParams(() => ({ keys: store.entries().map(e => e.calEventKey ?? '').filter(k => !!k) })),
      stream: ({ params }) => params.keys.length ? store.trainerBillingService.eventNames(params.keys) : of({} as Record<string, string>),
    }),
  })),

  withMethods((store) => ({
    /******************************** setters ******************************************* */
    previousMonth(): void {
      patchState(store, { month: shiftMonth(store.month(), -1) });
    },
    nextMonth(): void {
      if (store.canGoNext()) patchState(store, { month: shiftMonth(store.month(), 1) });
    },
    setBooks(books: string): void {
      patchState(store, { books });
    },

    /******************************** getters ******************************************* */
    /** the event name of an entry recorded at an event, else its text */
    entryText(entry: WorkEntryModel): string {
      return (entry.calEventKey ? store.eventNamesResource.value()?.[entry.calEventKey] : '') || entry.label || '';
    },
    serviceName(entry: WorkEntryModel): string {
      return this.serviceOf(entry)?.name || entry.serviceKey || '';
    },
    /** `1.5 Std.` / `1 Tage` — the quantity only, never an amount */
    quantityText(entry: WorkEntryModel): string {
      const unit = this.serviceOf(entry)?.unit === 'day' ? store.i18n.me_unit_days() : store.i18n.me_unit_hours();
      return `${entry.quantity ?? 0} ${unit}`;
    },
    serviceOf(entry: WorkEntryModel) {
      return store.agreements().find(a => a.okey === entry.agreementKey)?.services?.find(s => s.key === entry.serviceKey);
    },
    viewDate(storeDate: string): string {
      return storeDate ? convertDateFormatToString(storeDate, DateFormat.StoreDate, DateFormat.ViewDate) : '';
    },

    /******************************** profile ******************************************* */
    /**
     * «Rechnungsangaben»: the stored profile (or the draft kept while the trainer added an address), with the
     * trainer's own postal addresses and bank accounts read fresh. «Adresse erfassen» keeps the draft and leads to
     * the person's profile; coming back re-offers it (the page calls this again on enter).
     */
    async editProfile(): Promise<void> {
      const personKey = store.personKey();
      if (!personKey) return;
      await this.whileBusy(async () => {
        const [postalAddresses, bankAddresses] = await Promise.all([
          store.trainerBillingService.ownAddresses(personKey, 'postal'),
          store.trainerBillingService.ownAddresses(personKey, 'bankaccount'),
        ]);
        const profile = store.profileDraft() ?? store.profileResource.value() ?? { ...new TrainerProfileModel(store.appStore.tenantId()), okey: personKey };
        const { TrainerProfileEditModal, TRAINER_PROFILE_ADD_ADDRESS_ROLE } = await import('@okr/finance-trainer-billing-ui');
        const modal = await store.modalController.create({
          component: TrainerProfileEditModal,
          componentProps: { profile, personKey, tenantId: store.appStore.tenantId(), postalAddresses, bankAddresses },
        });
        await modal.present();
        const { data, role } = await modal.onDidDismiss<TrainerProfileModel>();
        if (role === TRAINER_PROFILE_ADD_ADDRESS_ROLE) {
          patchState(store, { profileDraft: data ?? profile });
          await showToast(store.toastController, store.i18n.me_address_hint());
          await store.router.navigate(['/person/profile']);
          return;
        }
        patchState(store, { profileDraft: undefined });
        if (role === 'confirm' && data) await store.trainerBillingService.saveProfile(personKey, data);
      });
    },

    /******************************** work entries ******************************************* */
    /** «Einsatz hinzufügen»: an entry without event under the month's agreement of the chosen books. */
    async addEntry(): Promise<void> {
      const agreement = store.agreement();
      if (!agreement) return;
      const service = (agreement.services ?? []).find(s => !s.isArchived);
      const entry: WorkEntryModel = {
        ...new WorkEntryModel(store.appStore.tenantId()),
        tenants: agreement.tenants,
        accountingTenantId: agreement.accountingTenantId,
        personKey: store.personKey(),
        agreementKey: agreement.okey,
        date: entryDefaultDate(store.month(), store.today),
        serviceKey: service?.key ?? '',
        quantity: 1,
      };
      await this.editEntry(entry);
    },

    /** Edit an open entry (or show an invoiced one read-only); saves on `confirm`. */
    async editEntry(entry: WorkEntryModel): Promise<void> {
      await this.whileBusy(async () => {
        const agreements = this.agreementsFor(entry);
        const { WorkEntryEditModal } = await import('@okr/finance-trainer-billing-ui');
        const modal = await store.modalController.create({
          component: WorkEntryEditModal,
          componentProps: { entry, agreements, booksLabels: store.booksLabels() },
        });
        await modal.present();
        const { data, role } = await modal.onDidDismiss<WorkEntryModel>();
        if (role !== 'confirm' || !data) return;
        await store.trainerBillingService.saveEntry(data, agreements.find(a => a.okey === data.agreementKey));
      });
    },

    /** Delete an open entry after a confirmation. */
    async deleteEntry(entry: WorkEntryModel): Promise<void> {
      if ((entry.state ?? 'open') !== 'open') return;
      const ok = await confirm(store.alertController, fill(store.i18n.me_delete_confirm(), { date: this.viewDate(entry.date) }),
        store.i18n.me_action_delete(), store.i18n.trainers_action_cancel(), true);
      if (!ok) return;
      await store.trainerBillingService.deleteEntry(entry.okey);
    },

    /** The agreements an entry may be booked on: those of the month, plus its own when it is not among them. */
    agreementsFor(entry: WorkEntryModel): TrainerAgreementModel[] {
      const month = store.monthAgreements();
      if (!entry.agreementKey || month.some(a => a.okey === entry.agreementKey)) return month;
      const own = store.agreements().find(a => a.okey === entry.agreementKey);
      return own ? [...month, own] : month;
    },

    /******************************** invoice ******************************************* */
    /** «Vorschau»: the invoice as it would be sent, as a PDF download; nothing is stored. */
    async preview(): Promise<void> {
      const agreement = store.agreement();
      if (!agreement) return;
      const month = store.month();
      await this.whileBusy(async () => {
        await this.saveFile(await store.trainerBillingService.preview(agreement.okey, month), `Vorschau-${month}.pdf`);
      });
    },

    /** «An Kassier senden»: confirm month and number of entries, then send; a refusal shows its reason. */
    async send(): Promise<void> {
      const agreement = store.agreement();
      const count = store.openEntries().length;
      if (!agreement || count === 0) return;
      const month = store.month();
      await this.whileBusy(async () => {
        const ok = await confirm(store.alertController, fill(store.i18n.me_send_confirm(), { month: monthTitleDe(month), count }),
          store.i18n.me_send(), store.i18n.trainers_action_cancel(), true);
        if (!ok) return;
        const { invoiceNo } = await store.trainerBillingService.send(agreement.okey, month);
        await showToast(store.toastController, fill(store.i18n.me_send_conf(), { invoiceNo }));
      });
    },

    /** The PDF of a sent invoice, through the callable (finance-documents are private). */
    async download(invoice: TrainerInvoiceModel): Promise<void> {
      await this.whileBusy(async () => {
        await this.saveFile(await store.trainerBillingService.download(invoice.okey), `${invoice.invoiceNo || invoice.okey}.pdf`);
      }, store.i18n.trainers_download_error());
    },

    async saveFile(file: Blob, fallbackName: string): Promise<void> {
      const url = URL.createObjectURL(file);
      try {
        await downloadFile(url, file instanceof File ? file.name : fallbackName);
      } finally {
        URL.revokeObjectURL(url);
      }
    },

    /**
     * Run one callable (or modal) at a time; a refusal of the server is shown as its message, any other error as
     * `fallback` (or the generic refusal message).
     */
    async whileBusy(action: () => Promise<void>, fallback?: string): Promise<void> {
      if (store.busy()) return;
      patchState(store, { busy: true });
      try {
        await action();
      } catch (e) {
        console.error('TrainerBillingStore: action failed', e);
        const message = trainerBillingRefusal(e) || !fallback ? store.i18n[trainerBillingRefusalKey(e)]() : fallback;
        await showToast(store.toastController, message);
      } finally {
        patchState(store, { busy: false });
      }
    },
  })),
);

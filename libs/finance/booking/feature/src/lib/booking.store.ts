import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController, ToastController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';
import { take } from 'rxjs/operators';

import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { BookingLineModel, BookingModel } from '@okr/shared-models';
import { getTodayStr, getYear } from '@okr/shared-util-core';
import { exportCsv } from '@okr/shared-util-angular';

import { AccountingStore } from '@okr/finance-accounting-feature';
import { AccountService } from '@okr/finance-account-data-access';
import { BookingLineService, BookingService } from '@okr/finance-booking-data-access';
import {
  BOOKING_ACTIONS,
  BookingAction,
  BOOKING_I18N_KEYS,
  BookingI18n,
  bookingYear,
  buildReceiptPayload,
  JournalRow,
  journalToRows,
  matchActions,
  matchesJournalSearch,
  ReceiptParty,
  toJournalRow,
} from '@okr/finance-booking-util';
import { PersonService } from '@okr/subject-person-data-access';
import { OrgService } from '@okr/subject-org-data-access';
import { AddressService } from '@okr/subject-address-data-access';
import { DocGenerationService } from '@okr/pdf-template-data-access';

import { BookingEditModal } from './booking-edit.modal';

export type { BookingI18n };

const ALL_YEARS = 99;   // sentinel emitted by okr-year-select for "all years"

export const BookingStore = signalStore(
  withState({ searchTerm: '', selectedYear: getYear() }),
  withProps(() => ({
    bookingService: inject(BookingService),
    bookingLineService: inject(BookingLineService),
    accountingStore: inject(AccountingStore),
    appStore: inject(AppStore),
    modalController: inject(ModalController),
    i18nService: inject(I18nService),
    accountService: inject(AccountService),
    personService: inject(PersonService),
    orgService: inject(OrgService),
    addressService: inject(AddressService),
    docGenerationService: inject(DocGenerationService),
    toastController: inject(ToastController),
  })),
  withProps(store => ({
    i18n: store.i18nService.translateAll(BOOKING_I18N_KEYS),
    bookingsResource: rxResource({
      stream: () => store.bookingService.list(store.accountingStore.accountingTenantId()),
    }),
    linesResource: rxResource({
      stream: () => store.bookingLineService.list(store.accountingStore.accountingTenantId()),
    }),
    accountsResource: rxResource({
      stream: () => store.accountService.list(store.accountingStore.accountingTenantId(), 'id', 'asc'),
    }),
  })),
  withComputed(store => ({
    bookings: computed(() => store.bookingsResource.value() ?? []),
    isLoading: computed(() => store.bookingsResource.isLoading()),
    currentUser: computed(() => store.appStore.currentUser()),
    accountingTenantId: computed(() => store.accountingStore.accountingTenantId()),
    isReadOnly: computed(() => store.accountingStore.isExternallyManaged()),
    tenantId: computed(() => store.appStore.tenantId()),
    accountIdByKey: computed(() => {
      const map = new Map<string, string>();
      for (const a of store.accountsResource.value() ?? []) map.set(a.okey, a.id);
      return map;
    }),
    linesByBooking: computed(() => {
      const map = new Map<string, BookingLineModel[]>();
      for (const line of store.linesResource.value() ?? []) {
        const arr = map.get(line.bookingKey) ?? [];
        arr.push(line);
        map.set(line.bookingKey, arr);
      }
      return map;
    }),
  })),
  withComputed(store => ({
    // Flattened journal rows for display, newest booking first.
    journalRows: computed<JournalRow[]>(() => {
      const accountIdByKey = store.accountIdByKey();
      const linesByBooking = store.linesByBooking();
      return store.bookings()
        .map(b => toJournalRow(b, linesByBooking.get(b.okey) ?? [], accountIdByKey))
        .sort((a, b) => (b.booking.date ?? '').localeCompare(a.booking.date ?? '') || b.booking.bookingNo - a.booking.bookingNo);
    }),
    // Distinct booking years (desc), always including the current year for the filter.
    years: computed<number[]>(() => {
      const set = new Set<number>([getYear()]);
      for (const b of store.bookings()) {
        const y = bookingYear(b);
        if (y > 0) set.add(y);
      }
      return [...set].sort((a, b) => b - a);
    }),
  })),
  withComputed(store => ({
    // journalRows narrowed by the selected year and the free-text search term.
    filteredRows: computed<JournalRow[]>(() => {
      const year = store.selectedYear();
      const term = store.searchTerm();
      return store.journalRows()
        .filter(r => year === ALL_YEARS || r.year === year)
        .filter(r => matchesJournalSearch(r, term));
    }),
  })),
  withMethods(store => ({
    setSearchTerm(term: string): void {
      patchState(store, { searchTerm: term });
    },

    setSelectedYear(year: number): void {
      patchState(store, { selectedYear: year });
    },

    async export(): Promise<void> {
      const data = journalToRows(store.filteredRows(), {
        date:   store.i18n.col_date(),
        credit: store.i18n.col_credit(),
        debit:  store.i18n.col_debit(),
        name:   store.i18n.col_name(),
        amount: store.i18n.col_amount(),
      });
      await exportCsv(data, `journal-${getTodayStr()}`);
    },

    async openCreate(): Promise<void> {
      if (store.isReadOnly()) return;
      const tenantId = store.tenantId();
      const accountingTenantId = store.accountingTenantId();
      const year = new Date().getFullYear();
      const seq = await store.bookingService.nextSequence(year, accountingTenantId);
      const booking = new BookingModel(tenantId, accountingTenantId);
      booking.bookingNo = seq;
      await this.openEdit(booking, [], false);
    },

    async openEdit(booking: BookingModel, lines: BookingLineModel[], readOnly = true): Promise<void> {
      const modal = await store.modalController.create({
        component: BookingEditModal,
        componentProps: { booking, lines, readOnly, currentUser: store.currentUser() },
      });
      await modal.present();
      const { data, role } = await modal.onDidDismiss<{ booking: BookingModel; lines: BookingLineModel[] }>();
      if (role === 'confirm' && data && !store.isReadOnly()) {
        const okey = (data.booking as BookingModel & { okey: string }).okey;
        if (okey?.length > 0) {
          await store.bookingService.update(data.booking, data.lines, store.currentUser());
        } else {
          await store.bookingService.create(data.booking, data.lines, store.currentUser());
        }
        store.bookingsResource.reload();
        store.linesResource.reload();
      }
    },

    async delete(booking: BookingModel): Promise<void> {
      if (store.isReadOnly()) return;
      await store.bookingService.delete(booking, store.currentUser());
      store.bookingsResource.reload();
      store.linesResource.reload();
    },

    availableActions(booking: BookingModel): BookingAction[] {
      const lines = store.linesByBooking().get(booking.okey) ?? [];
      const accountIds = lines
        .map((l) => store.accountIdByKey().get(l.accountKey))
        .filter((id): id is string => !!id);
      return matchActions(booking.accountingTenantId, accountIds, BOOKING_ACTIONS);
    },

    async runAction(action: BookingAction, booking: BookingModel): Promise<void> {
      if (action.type !== 'generateDocument') return;
      if (!booking.counterparty) {
        await this.toast(store.i18n.action_counterpartyRequired());
        return;
      }
      const lines = store.linesByBooking().get(booking.okey) ?? [];
      const line = lines.find(
        (l) => store.accountIdByKey().get(l.accountKey) === action.trigger.accountId,
      );
      const amountRappen = line?.creditAmount?.amount ?? line?.debitAmount?.amount ?? 0;

      const cp = booking.counterparty;
      const address = await firstValueFrom(store.addressService.getFavoritePostalAddress(cp.key).pipe(take(1)));
      if (!address) {
        await this.toast(store.i18n.action_noAddress());
        return;
      }
      let party: ReceiptParty;
      if (cp.modelType === 'org') {
        const org = await firstValueFrom(store.orgService.read(cp.key).pipe(take(1)));
        if (!org) { await this.toast(store.i18n.action_failed()); return; }
        party = { kind: 'org', org };
      } else if (cp.modelType === 'person') {
        const person = await firstValueFrom(store.personService.read(cp.key).pipe(take(1)));
        if (!person) { await this.toast(store.i18n.action_failed()); return; }
        party = { kind: 'person', person };
      } else {
        await this.toast(store.i18n.action_failed());
        return;
      }

      const payload = {
        ...(action.staticPayload ?? {}),
        ...buildReceiptPayload(party, address, amountRappen, booking.date),
      };

      try {
        const res = await store.docGenerationService.generate({
          templateId: action.templateId,
          payload,
          options: {
            outputFormat: action.outputFormat ?? 'pdf',
            storageMode: 'persist',
            margin: { top: '0', right: '0', bottom: '0', left: '0' },
            metadata: { entityType: 'booking', entityId: booking.okey },
          },
        });
        window.open(res.url, '_blank');
      } catch {
        await this.toast(store.i18n.action_failed());
      }
    },

    async toast(message: string): Promise<void> {
      const t = await store.toastController.create({ message, duration: 2500 });
      await t.present();
    },
  }))
);

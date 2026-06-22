import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController, ToastController } from '@ionic/angular/standalone';
import { signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';
import { take } from 'rxjs/operators';

import { AppStore } from '@bk2/shared-feature';
import { I18nService } from '@bk2/shared-i18n';
import { BookingLineModel, BookingModel } from '@bk2/shared-models';

import { AccountingStore } from '@bk2/finance-accounting-feature';
import { AccountService } from '@bk2/finance-account-data-access';
import { BookingLineService, BookingService } from '@bk2/finance-booking-data-access';
import {
  BOOKING_ACTIONS,
  BookingAction,
  BOOKING_I18N_KEYS,
  BookingI18n,
  buildReceiptPayload,
  matchActions,
  ReceiptParty,
} from '@bk2/finance-booking-util';
import { PersonService } from '@bk2/subject-person-data-access';
import { OrgService } from '@bk2/subject-org-data-access';
import { AddressService } from '@bk2/subject-address-data-access';
import { DocGenerationService } from '@bk2/pdf-template-data-access';

import { BookingEditModal } from './booking-edit.modal';

export type { BookingI18n };

export const BookingStore = signalStore(
  withState({ filter: '' }),
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
      for (const a of store.accountsResource.value() ?? []) map.set(a.bkey, a.id);
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
  withMethods(store => ({
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
        const bkey = (data.booking as BookingModel & { bkey: string }).bkey;
        if (bkey?.length > 0) {
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
      const lines = store.linesByBooking().get(booking.bkey) ?? [];
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
      const lines = store.linesByBooking().get(booking.bkey) ?? [];
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
            metadata: { entityType: 'booking', entityId: booking.bkey },
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

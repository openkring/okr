import { computed, inject, Signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { AppStore } from '@bk2/shared-feature';
import { I18nService } from '@bk2/shared-i18n';
import { BookingLineModel, BookingModel } from '@bk2/shared-models';

import { AccountingStore } from '@bk2/finance-accounting-feature';
import { BookingLineService, BookingService } from '@bk2/finance-booking-data-access';

import { BookingEditModal } from './booking-edit.modal';
import { PFX } from './scope';

const BOOKING_I18N_KEYS = {
  list_title: PFX + 'list.title',
  empty:      PFX + 'empty',
  as_view:    PFX + 'actionsheet.view',
  as_edit:    PFX + 'actionsheet.edit',
  as_create:  PFX + 'actionsheet.create',
  as_delete:  PFX + 'actionsheet.delete',
} satisfies Record<string, string>;

export type BookingI18n = { [K in keyof typeof BOOKING_I18N_KEYS]: Signal<string> };

export const BookingStore = signalStore(
  withState({ filter: '' }),
  withProps(() => ({
    bookingService: inject(BookingService),
    bookingLineService: inject(BookingLineService),
    accountingStore: inject(AccountingStore),
    appStore: inject(AppStore),
    modalController: inject(ModalController),
    i18nService: inject(I18nService),
  })),
  withProps(store => ({
    i18n: store.i18nService.translateAll(BOOKING_I18N_KEYS),
    bookingsResource: rxResource({
      stream: () => store.bookingService.list(store.accountingStore.accountingTenantId()),
    }),
  })),
  withComputed(store => ({
    bookings: computed(() => store.bookingsResource.value() ?? []),
    isLoading: computed(() => store.bookingsResource.isLoading()),
    currentUser: computed(() => store.appStore.currentUser()),
    accountingTenantId: computed(() => store.accountingStore.accountingTenantId()),
    isReadOnly: computed(() => store.accountingStore.isExternallyManaged()),
    tenantId: computed(() => store.appStore.tenantId()),
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
      if (role === 'confirm' && data) {
        const bkey = (data.booking as BookingModel & { bkey: string }).bkey;
        if (bkey?.length > 0) {
          await store.bookingService.update(data.booking, data.lines, store.currentUser());
        } else {
          await store.bookingService.create(data.booking, data.lines, store.currentUser());
        }
        store.bookingsResource.reload();
      }
    },

    async delete(booking: BookingModel): Promise<void> {
      if (store.isReadOnly()) return;
      await store.bookingService.delete(booking, store.currentUser());
      store.bookingsResource.reload();
    },
  }))
);

import { Component, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import {
  IonAccordion, IonAccordionGroup, IonBadge, IonButton, IonButtons,
  IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList,
  IonMenuButton, IonTitle, IonToolbar,
} from '@ionic/angular/standalone';

import { AppStore } from '@bk2/shared-feature';
import { I18nService } from '@bk2/shared-i18n';
import { Spinner } from '@bk2/shared-ui';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { AlertService } from '@bk2/shared-util-angular';
import { TripModel } from '@bk2/shared-models';

import { TripService } from '@bk2/trip-data-access';
import { TRIP_I18N_KEYS, TripI18n, formatTripTime } from '@bk2/trip-util';

import { TripEditModal } from './trip-edit.modal';

const AocTripStore = signalStore(
  withState({ _dummy: 0 }),
  withProps(() => ({
    appStore: inject(AppStore),
    tripService: inject(TripService),
    modalController: inject(ModalController),
    alertService: inject(AlertService),
    i18nService: inject(I18nService),
  })),
  withProps(store => ({
    i18n: store.i18nService.translateAll(TRIP_I18N_KEYS) as TripI18n,
  })),
  withProps(store => ({
    allTripsResource: rxResource({
      params: () => ({ tenantId: store.appStore.tenantId() }),
      stream: () => store.tripService.list('startDate', 'desc'),
    }),
  })),
  withComputed(store => ({
    isLoading: computed(() => store.allTripsResource.isLoading()),
    trashTrips: computed(() =>
      store.allTripsResource.value()?.filter(t => !!t.deletedAt) ?? []
    ),
    notesTrips: computed(() =>
      store.allTripsResource.value()?.filter(t => !!t.notes && t.notes.trim().length > 0) ?? []
    ),
    zeroKmTrips: computed(() =>
      store.allTripsResource.value()?.filter(t => t.distance === 0 && !t.deletedAt) ?? []
    ),
    flaggedTrips: computed(() =>
      store.allTripsResource.value()?.filter(t => t.flagged === true) ?? []
    ),
  })),
  withMethods(store => ({
    async restoreTrip(trip: TripModel): Promise<void> {
      const restored = { ...trip, deletedAt: null, deletedBy: null, state: 'closed' } as TripModel;
      await store.tripService.update(restored, store.appStore.currentUser());
      store.allTripsResource.reload();
    },

    async hardDeleteTrip(trip: TripModel): Promise<void> {
      const confirmed = await store.alertService.confirm(store.i18n.aoc_hard_delete_confirm(), true);
      if (!confirmed) return;
      const tombstone = { ...trip, state: 'deleted.permanent', deletedAt: new Date().toISOString() } as TripModel;
      await store.tripService.update(tombstone, store.appStore.currentUser());
      store.allTripsResource.reload();
    },

    async openEditModal(trip: TripModel): Promise<void> {
      const modal = await store.modalController.create({
        component: TripEditModal,
        componentProps: { trip, mode: 'edit' },
      });
      await modal.present();
      await modal.onDidDismiss();
      store.allTripsResource.reload();
    },

    async clearFlag(trip: TripModel): Promise<void> {
      const updated = { ...trip, flagged: false } as TripModel;
      await store.tripService.update(updated, store.appStore.currentUser());
      store.allTripsResource.reload();
    },

    async softDeleteFlagged(trip: TripModel): Promise<void> {
      const updated = {
        ...trip,
        state: 'deleted',
        deletedAt: new Date().toISOString(),
        deletedBy: store.appStore.currentUser()?.bkey ?? null,
      } as TripModel;
      await store.tripService.update(updated, store.appStore.currentUser());
      store.allTripsResource.reload();
    },
  }))
);

@Component({
  selector: 'bk-aoc-trip',
  standalone: true,
  imports: [
    SvgIconPipe, Spinner,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonMenuButton,
    IonContent, IonList, IonItem, IonLabel, IonBadge,
    IonIcon, IonButton, IonAccordionGroup, IonAccordion,
  ],
  providers: [AocTripStore],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ store.i18n.aoc_title() }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      @if (store.isLoading()) {
        <bk-spinner />
      } @else {
        <ion-accordion-group [multiple]="true">

          <!-- Trash -->
          <ion-accordion value="trash">
            <ion-item slot="header">
              <ion-label>{{ store.i18n.aoc_trash() }}</ion-label>
              @if (store.trashTrips().length > 0) {
                <ion-badge color="danger" slot="end">{{ store.trashTrips().length }}</ion-badge>
              }
            </ion-item>
            <ion-list slot="content">
              @for (trip of store.trashTrips(); track trip.bkey) {
                <ion-item>
                  <ion-label>
                    <strong>{{ formatTime(trip.startTime) }} {{ trip.resource?.name1 }}</strong>
                    <p>{{ trip.notes }}</p>
                  </ion-label>
                  <ion-button slot="end" fill="clear" color="success" (click)="store.restoreTrip(trip)">
                    <ion-icon src="{{ 'reload' | svgIcon }}" slot="icon-only" />
                  </ion-button>
                  <ion-button slot="end" fill="clear" color="danger" (click)="store.hardDeleteTrip(trip)">
                    <ion-icon src="{{ 'trash' | svgIcon }}" slot="icon-only" />
                  </ion-button>
                </ion-item>
              }
            </ion-list>
          </ion-accordion>

          <!-- Notes -->
          <ion-accordion value="notes">
            <ion-item slot="header">
              <ion-label>{{ store.i18n.notes_label() }}</ion-label>
              @if (store.notesTrips().length > 0) {
                <ion-badge color="medium" slot="end">{{ store.notesTrips().length }}</ion-badge>
              }
            </ion-item>
            <ion-list slot="content">
              @for (trip of store.notesTrips(); track trip.bkey) {
                <ion-item button (click)="store.openEditModal(trip)">
                  <ion-label>
                    <strong>{{ formatTime(trip.startTime) }} {{ trip.resource?.name1 }}</strong>
                    <p>{{ trip.notes }}</p>
                  </ion-label>
                </ion-item>
              }
            </ion-list>
          </ion-accordion>

          <!-- 0 km -->
          <ion-accordion value="zero_km">
            <ion-item slot="header">
              <ion-label>{{ store.i18n.aoc_zero_km() }}</ion-label>
              @if (store.zeroKmTrips().length > 0) {
                <ion-badge color="warning" slot="end">{{ store.zeroKmTrips().length }}</ion-badge>
              }
            </ion-item>
            <ion-list slot="content">
              @for (trip of store.zeroKmTrips(); track trip.bkey) {
                <ion-item button (click)="store.openEditModal(trip)">
                  <ion-label>
                    <strong>{{ formatTime(trip.startTime) }} {{ trip.resource?.name1 }}</strong>
                    <p>{{ trip.startDate }} — {{ trip.participants.length }} Pers.</p>
                  </ion-label>
                </ion-item>
              }
            </ion-list>
          </ion-accordion>

          <!-- Flagged -->
          <ion-accordion value="flagged">
            <ion-item slot="header">
              <ion-label>{{ store.i18n.aoc_flagged() }}</ion-label>
              @if (store.flaggedTrips().length > 0) {
                <ion-badge color="danger" slot="end">{{ store.flaggedTrips().length }}</ion-badge>
              }
            </ion-item>
            <ion-list slot="content">
              @for (trip of store.flaggedTrips(); track trip.bkey) {
                <ion-item>
                  <ion-label>
                    <strong>{{ formatTime(trip.startTime) }} {{ trip.resource?.name1 }}</strong>
                    <p>{{ trip.notes }}</p>
                  </ion-label>
                  <ion-button slot="end" fill="clear" color="medium" (click)="store.clearFlag(trip)">
                    <ion-icon src="{{ 'flag-outline' | svgIcon }}" slot="icon-only" />
                  </ion-button>
                  <ion-button slot="end" fill="clear" color="danger" (click)="store.softDeleteFlagged(trip)">
                    <ion-icon src="{{ 'trash' | svgIcon }}" slot="icon-only" />
                  </ion-button>
                </ion-item>
              }
            </ion-list>
          </ion-accordion>

        </ion-accordion-group>
      }
    </ion-content>
  `,
})
export class AocTrip {
  protected readonly store = inject(AocTripStore);
  protected readonly formatTime = formatTripTime;
}

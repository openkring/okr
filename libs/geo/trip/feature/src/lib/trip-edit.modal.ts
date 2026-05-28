import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { format } from 'date-fns';
import { IonButton, IonContent, ModalController } from '@ionic/angular/standalone';
import { rxResource } from '@angular/core/rxjs-interop';

import { AppStore } from '@bk2/shared-feature';
import { Header } from '@bk2/shared-ui';
import { AlertService } from '@bk2/shared-util-angular';
import { DateFormat, getTodayStr, safeStructuredClone } from '@bk2/shared-util-core';
import { LocationModel, ResourceModel, TripModel } from '@bk2/shared-models';

import { LocationService } from '@bk2/location-data-access';
import { TripEditForm } from '@bk2/trip-ui';
import { newTripName, getTripIndex } from '@bk2/trip-util';
import { TripService } from '@bk2/trip-data-access';
import { TripStore } from './trip.store';

@Component({
  selector: 'bk-trip-edit-modal',
  standalone: true,
  imports: [Header, TripEditForm, IonContent, IonButton],
  providers: [TripStore],
  template: `
    <bk-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    <ion-content>
      @if (formData(); as fd) {
        <bk-trip-edit-form
          [trip]="fd"
          [mode]="mode()"
          [boats]="boats()"
          [locations]="locations()"
          [i18n]="store.i18n"
          (tripChange)="onTripChange($event)"
          (validityChange)="formValid.set($event)"
        />
      }
      <ion-button
        expand="block"
        [disabled]="!formValid()"
        (click)="save()"
        style="margin: 16px;"
      >
        Speichern
      </ion-button>
    </ion-content>
  `,
})
export class TripEditModal {
  private readonly modalController = inject(ModalController);
  private readonly tripService = inject(TripService);
  private readonly alertService = inject(AlertService);
  private readonly appStore = inject(AppStore);
  private readonly locationService = inject(LocationService);
  protected readonly store = inject(TripStore);

  public readonly trip = input.required<TripModel>();
  public readonly mode = input.required<'add' | 'edit' | 'end'>();

  protected formData = linkedSignal(() => safeStructuredClone(this.trip()) ?? this.trip());
  protected formValid = signal(false);

  protected boats = computed(() =>
    (this.appStore.allResources() ?? []).filter((r: ResourceModel) => r.type === 'rboat')
  );

  private readonly locationsResource = rxResource({
    params: () => ({}),
    stream: () => this.locationService.list(),
  });

  protected locations = computed(() => this.locationsResource.value() ?? [] as LocationModel[]);

  protected headerTitle = computed(() => {
    switch (this.mode()) {
      case 'add':  return this.store.i18n.add_title();
      case 'edit': return this.store.i18n.edit_title();
      case 'end':  return this.store.i18n.end_title();
    }
  });

  protected onTripChange(trip: TripModel): void {
    this.formData.set(trip);
  }

  public async save(): Promise<void> {
    const trip = this.formData();
    const currentUser = this.appStore.currentUser();

    if (trip.distance === 0 || trip.distance > 50) {
      const warningKey = trip.distance === 0
        ? this.store.i18n.warning_distance_zero()
        : this.store.i18n.warning_distance_high();
      const confirmed = await this.alertService.confirm(warningKey, true);
      if (!confirmed) return;
      await this.store.reportDamage(trip);
    }

    trip.name = newTripName(trip);
    trip.index = getTripIndex(trip);

    switch (this.mode()) {
      case 'add':
        trip.state = 'open';
        await this.tripService.create(trip, currentUser);
        break;
      case 'edit':
        trip.state = trip.state.endsWith('.rev') ? trip.state : trip.state + '.rev';
        await this.tripService.update(trip, currentUser);
        break;
      case 'end':
        trip.endDate = getTodayStr(DateFormat.StoreDate);
        trip.endTime = format(new Date(), 'HHmm');
        trip.state = trip.state.includes('.rev') ? 'closed.rev' : 'closed';
        await this.tripService.update(trip, currentUser);
        break;
    }

    if (this.mode() === 'add' || this.mode() === 'edit') {
      const reasons = this.store.checkSuspiciousActivity(trip);
      if (reasons.length > 0) {
        await this.store.recordSuspiciousActivity(trip, reasons);
      }
    }

    await this.modalController.dismiss(null, 'confirm');
  }
}

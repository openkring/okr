import { Component, computed, input, output, Signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonChip, IonInput, IonItem, IonLabel, IonNote,
  IonSelect, IonSelectOption, IonTextarea,
} from '@ionic/angular/standalone';

import { AvatarInfo, LocationModel, ResourceModel, TripModel } from '@bk2/shared-models';
import { formatTripTime } from '@bk2/trip-util';

import { LocationSelect, LocationSelectI18n } from './location-select';

export interface TripFormI18n extends LocationSelectI18n {
  add_title: Signal<string>;
  edit_title: Signal<string>;
  end_title: Signal<string>;
  field_boat: Signal<string>;
  field_location: Signal<string>;
  field_custom_location: Signal<string>;
  field_distance: Signal<string>;
  field_participants: Signal<string>;
  field_notes: Signal<string>;
  field_start_date: Signal<string>;
  field_start_time: Signal<string>;
  field_end_date: Signal<string>;
  field_end_time: Signal<string>;
  warning_distance_zero: Signal<string>;
  warning_distance_high: Signal<string>;
  warning_seats_mismatch: Signal<string>;
  location_list_view: Signal<string>;
  location_map_view: Signal<string>;
  location_search: Signal<string>;
  location_none: Signal<string>;
}

@Component({
  selector: 'bk-trip-edit-form',
  standalone: true,
  imports: [
    FormsModule,
    IonItem, IonLabel, IonNote, IonInput, IonTextarea,
    IonSelect, IonSelectOption, IonChip,
    LocationSelect,
  ],
  template: `
    <!-- Start date/time (display only) -->
    <ion-item lines="full">
      <ion-label position="stacked">{{ i18n().field_start_date() }}</ion-label>
      <ion-note slot="end">{{ formData().startDate }}</ion-note>
    </ion-item>
    <ion-item lines="full">
      <ion-label position="stacked">{{ i18n().field_start_time() }}</ion-label>
      <ion-note slot="end">{{ formatTime(formData().startTime) }}</ion-note>
    </ion-item>

    <!-- End date/time (edit/end mode only) -->
    @if (mode() === 'edit' || mode() === 'end') {
      <ion-item lines="full">
        <ion-label position="stacked">{{ i18n().field_end_date() }}</ion-label>
        <ion-input
          type="date"
          [ngModel]="endDateIso()"
          (ngModelChange)="onEndDateChange($event)"
        />
      </ion-item>
      <ion-item lines="full">
        <ion-label position="stacked">{{ i18n().field_end_time() }}</ion-label>
        <ion-input
          type="time"
          [ngModel]="endTimeDisplay()"
          (ngModelChange)="onEndTimeChange($event)"
        />
      </ion-item>
    }

    <!-- Boat select -->
    <ion-item lines="full">
      <ion-label position="stacked">{{ i18n().field_boat() }}</ion-label>
      <ion-select
        [ngModel]="formData().resource?.key ?? ''"
        (ngModelChange)="onBoatChange($event)"
        interface="action-sheet"
      >
        @for (boat of boats(); track boat.bkey) {
          <ion-select-option [value]="boat.bkey">{{ boat.name }}</ion-select-option>
        }
      </ion-select>
    </ion-item>

    <!-- Location select (structured) + custom label fallback -->
    <ion-item lines="full">
      <ion-label position="stacked">{{ i18n().field_location() }}</ion-label>
    </ion-item>
    <bk-location-select
      [locations]="locations()"
      [selectedKey]="selectedLocationKey()"
      [i18n]="i18n()"
      (locationChange)="onLocationChange($event)"
    />

    @if (!selectedLocationKey()) {
      <ion-item lines="full">
        <ion-label position="stacked">{{ i18n().field_custom_location() }}</ion-label>
        <ion-input
          [ngModel]="formData().customLocationLabel"
          (ngModelChange)="patch({ customLocationLabel: $event })"
          [placeholder]="i18n().field_location()"
        />
      </ion-item>
    }

    <!-- Distance -->
    <ion-item lines="full">
      <ion-label position="stacked">{{ i18n().field_distance() }}</ion-label>
      <ion-input
        type="number"
        [ngModel]="formData().distance"
        (ngModelChange)="patch({ distance: +$event })"
        min="0"
      />
    </ion-item>
    @if (formData().distance === 0) {
      <ion-chip color="warning">{{ i18n().warning_distance_zero() }}</ion-chip>
    }
    @if (formData().distance > 50) {
      <ion-chip color="warning">{{ i18n().warning_distance_high() }}</ion-chip>
    }

    <!-- Notes -->
    <ion-item lines="full">
      <ion-label position="stacked">{{ i18n().field_notes() }}</ion-label>
      <ion-textarea
        [ngModel]="formData().notes"
        (ngModelChange)="patch({ notes: $event })"
        [rows]="3"
      />
    </ion-item>
  `,
})
export class TripEditForm {
  public readonly trip = input.required<TripModel>();
  public readonly mode = input.required<'add' | 'edit' | 'end'>();
  public readonly boats = input.required<ResourceModel[]>();
  public readonly locations = input.required<LocationModel[]>();
  public readonly i18n = input.required<TripFormI18n>();

  public readonly tripChange = output<TripModel>();
  public readonly validityChange = output<boolean>();

  protected formData = this.trip;

  protected formatTime = formatTripTime;

  protected selectedLocationKey = computed(() => this.formData().locations?.[0] ?? '');

  protected endDateIso(): string {
    const d = this.formData().endDate;
    if (!d || d.length !== 8) return '';
    return `${d.substring(0, 4)}-${d.substring(4, 6)}-${d.substring(6, 8)}`;
  }

  protected endTimeDisplay(): string {
    const t = this.formData().endTime;
    if (!t || t.length !== 4) return '';
    return `${t.substring(0, 2)}:${t.substring(2, 4)}`;
  }

  protected patch(partial: Partial<TripModel>): void {
    const updated = { ...this.formData(), ...partial };
    this.tripChange.emit(updated as TripModel);
    this.validityChange.emit(
      !!(updated.resource?.key) && (updated as TripModel).participants.length > 0
    );
  }

  protected onBoatChange(boatKey: string): void {
    const boat = this.boats().find(b => b.bkey === boatKey);
    if (!boat) return;
    this.patch({
      resource: {
        key: boat.bkey,
        name1: boat.name,
        name2: '',
        modelType: 'resource',
        type: boat.type,
        subType: boat.subType,
        label: boat.name,
      } as AvatarInfo,
    });
  }

  protected onLocationChange(locationKey: string): void {
    this.patch({
      locations: locationKey ? [locationKey] : [],
      customLocationLabel: locationKey ? '' : this.formData().customLocationLabel,
    });
  }

  protected onEndDateChange(isoDate: string): void {
    this.patch({ endDate: isoDate.replace(/-/g, '') });
  }

  protected onEndTimeChange(hhmm: string): void {
    this.patch({ endTime: hhmm.replace(':', '') });
  }
}

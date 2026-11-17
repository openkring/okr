import { Component, input, linkedSignal, model, Signal } from '@angular/core';
import {
  IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonRow,
  IonNote, IonSegment, IonSegmentButton, IonLabel, IonSelect, IonSelectOption, IonToggle
} from '@ionic/angular';

import { ConnectionsConfig } from '@okr/shared-models';
import { timetableConfigOf } from '@okr/mobility-transit-util';

import { WeatherLocationOption } from './weather-configuration';

interface ConnectionsConfigI18n {
  connections_title:              Signal<string>;
  connections_destination_label:  Signal<string>;
  connections_destination_helper: Signal<string>;
  connections_source_label:       Signal<string>;
  connections_source_helper:      Signal<string>;
  connections_fav_org:               Signal<string>;
  connections_fav_org_helper:        Signal<string>;
  connections_fav_home:              Signal<string>;
  connections_fav_home_helper:       Signal<string>;
  connections_fav_locations:         Signal<string>;
  connections_fav_locations_helper:  Signal<string>;
  connections_anchor:                Signal<string>;
  connections_anchor_dep:            Signal<string>;
  connections_anchor_arr:            Signal<string>;
  connections_add_calendar:          Signal<string>;
  connections_add_calendar_helper:   Signal<string>;
}

/**
 * Configuration of a connections section (spec 1.131 §4.1): the destination (empty ⇒ the page's
 * location) and an optional fixed start (empty ⇒ the viewer's current position). Both selects
 * offer an empty entry, because «leave empty» is a real choice for each of them.
 */
@Component({
  selector: 'okr-connections-config',
  standalone: true,
  imports: [
    IonRow, IonCol, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonGrid,
    IonSelect, IonSelectOption, IonToggle, IonNote, IonSegment, IonSegmentButton, IonLabel
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px; } }`],
  template: `
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ i18n().connections_title() }}</ion-card-title>
      </ion-card-header>
      <ion-card-content>
        <ion-grid>
          <ion-row>
            <ion-col size="12" size-md="6">
              <ion-select [label]="i18n().connections_destination_label()" labelPlacement="stacked"
                          [value]="destinationKey()" [disabled]="readOnly()"
                          [placeholder]="i18n().connections_destination_helper()"
                          (ionChange)="onChange('destinationKey', $event.detail.value)">
                <ion-select-option value="">–</ion-select-option>
                @for (loc of locations(); track loc.okey) {
                  <ion-select-option [value]="loc.okey">{{ loc.name }}</ion-select-option>
                }
              </ion-select>
            </ion-col>
            <ion-col size="12" size-md="6">
              <ion-select [label]="i18n().connections_source_label()" labelPlacement="stacked"
                          [value]="sourceKey()" [disabled]="readOnly()"
                          [placeholder]="i18n().connections_source_helper()"
                          (ionChange)="onChange('sourceKey', $event.detail.value)">
                <ion-select-option value="">–</ion-select-option>
                @for (loc of locations(); track loc.okey) {
                  <ion-select-option [value]="loc.okey">{{ loc.name }}</ion-select-option>
                }
              </ion-select>
            </ion-col>
          </ion-row>
          <ion-row>
            <ion-col size="12" size-md="6">
              <ion-toggle [checked]="favoriteDefaultOrg()" [disabled]="readOnly()"
                          (ionChange)="onBooleanChange('favoriteDefaultOrg', $event.detail.checked)">
                {{ i18n().connections_fav_org() }}
              </ion-toggle>
              <ion-note>{{ i18n().connections_fav_org_helper() }}</ion-note>
            </ion-col>
            <ion-col size="12" size-md="6">
              <ion-toggle [checked]="favoriteHomeAddress()" [disabled]="readOnly()"
                          (ionChange)="onBooleanChange('favoriteHomeAddress', $event.detail.checked)">
                {{ i18n().connections_fav_home() }}
              </ion-toggle>
              <ion-note>{{ i18n().connections_fav_home_helper() }}</ion-note>
            </ion-col>
          </ion-row>
          <ion-row>
            <ion-col size="12">
              <ion-select [label]="i18n().connections_fav_locations()" labelPlacement="stacked"
                          [multiple]="true" [value]="favoriteLocationKeys()" [disabled]="readOnly()"
                          [placeholder]="i18n().connections_fav_locations_helper()"
                          (ionChange)="onLocationKeysChange($event.detail.value)">
                @for (loc of locations(); track loc.okey) {
                  <ion-select-option [value]="loc.okey">{{ loc.name }}</ion-select-option>
                }
              </ion-select>
            </ion-col>
          </ion-row>
          <ion-row>
            <ion-col size="12" size-md="6">
              <ion-label>{{ i18n().connections_anchor() }}</ion-label>
              <ion-segment [value]="anchor()" [disabled]="readOnly()"
                           (ionChange)="onAnchorChange($event.detail.value)">
                <ion-segment-button value="departAt">
                  <ion-label>{{ i18n().connections_anchor_dep() }}</ion-label>
                </ion-segment-button>
                <ion-segment-button value="arriveBy">
                  <ion-label>{{ i18n().connections_anchor_arr() }}</ion-label>
                </ion-segment-button>
              </ion-segment>
            </ion-col>
            <ion-col size="12" size-md="6">
              <ion-toggle [checked]="allowAddToCalendar()" [disabled]="readOnly()"
                          (ionChange)="onBooleanChange('allowAddToCalendar', $event.detail.checked)">
                {{ i18n().connections_add_calendar() }}
              </ion-toggle>
              <ion-note>{{ i18n().connections_add_calendar_helper() }}</ion-note>
            </ion-col>
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>
  `
})
export class ConnectionsConfiguration {
  public formData = model.required<ConnectionsConfig>();
  public readonly readOnly = input(true);
  public readonly i18n = input.required<ConnectionsConfigI18n>();
  /** All locations the tenant may pick from. */
  public readonly locations = input<WeatherLocationOption[]>([]);

  protected destinationKey = linkedSignal(() => this.formData().destinationKey ?? '');
  protected sourceKey = linkedSignal(() => this.formData().sourceKey ?? '');

  /** Defaults filled for legacy docs (new fields are undefined on old sections). */
  private readonly cfg = linkedSignal(() => timetableConfigOf(this.formData()));
  protected favoriteDefaultOrg = linkedSignal(() => this.cfg().favoriteDefaultOrg);
  protected favoriteHomeAddress = linkedSignal(() => this.cfg().favoriteHomeAddress);
  protected favoriteLocationKeys = linkedSignal(() => this.cfg().favoriteLocationKeys);
  protected anchor = linkedSignal(() => this.cfg().anchor);
  protected allowAddToCalendar = linkedSignal(() => this.cfg().allowAddToCalendar);

  protected onChange(field: 'destinationKey' | 'sourceKey', value: unknown): void {
    this.formData.update((vm) => ({ ...vm, [field]: String(value ?? '') }));
  }

  protected onBooleanChange(field: 'favoriteDefaultOrg' | 'favoriteHomeAddress' | 'allowAddToCalendar', value: boolean): void {
    this.formData.update((vm) => ({ ...vm, [field]: value === true }));
  }

  /** Always a fresh array: the shape's default array is shared and must never be mutated. */
  protected onLocationKeysChange(value: unknown): void {
    const keys = Array.isArray(value) ? value.map((k) => String(k)) : [];
    this.formData.update((vm) => ({ ...vm, favoriteLocationKeys: [...keys] }));
  }

  protected onAnchorChange(value: unknown): void {
    if (value !== 'departAt' && value !== 'arriveBy') return;
    this.formData.update((vm) => ({ ...vm, anchor: value }));
  }
}

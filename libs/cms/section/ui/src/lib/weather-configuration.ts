import { Component, computed, input, linkedSignal, model, Signal } from '@angular/core';
import {
  IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonRow,
  IonSelect, IonSelectOption
} from '@ionic/angular/standalone';

import { WeatherConfig, WeatherVariant } from '@okr/shared-models';

/** The minimum a location select needs — the caller maps its models down to this. */
export interface WeatherLocationOption { okey: string; name: string; }

interface WeatherConfigI18n {
  weather_title:               Signal<string>;
  weather_variant_label:       Signal<string>;
  weather_location_label:      Signal<string>;
  weather_location_helper:     Signal<string>;
  weather_locations_label:     Signal<string>;
  weather_locations_helper:    Signal<string>;
  weather_orientation_label:   Signal<string>;
  weather_days_label:          Signal<string>;
}

/**
 * Configuration of a weather section. The `variant` decides which of the other fields matter,
 * so the form shows only those — a `map` has no day count and a `day-vertical` has no
 * orientation.
 */
@Component({
  selector: 'okr-weather-config',
  standalone: true,
  imports: [
    IonRow, IonCol, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonGrid,
    IonSelect, IonSelectOption
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px; } }`],
  template: `
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ i18n().weather_title() }}</ion-card-title>
      </ion-card-header>
      <ion-card-content>
        <ion-grid>
          <ion-row>
            <ion-col size="12" size-md="6">
              <ion-select [label]="i18n().weather_variant_label()" labelPlacement="stacked"
                          [value]="variant()" [disabled]="readOnly()"
                          (ionChange)="onChange('variant', $event.detail.value)">
                @for (v of variants; track v) {
                  <ion-select-option [value]="v">{{ v }}</ion-select-option>
                }
              </ion-select>
            </ion-col>

            @if (variant() !== 'map') {
              <ion-col size="12" size-md="6">
                <ion-select [label]="i18n().weather_location_label()" labelPlacement="stacked"
                            [value]="locationKey()" [disabled]="readOnly()"
                            [placeholder]="i18n().weather_location_helper()"
                            (ionChange)="onChange('locationKey', $event.detail.value)">
                  @for (loc of locations(); track loc.okey) {
                    <ion-select-option [value]="loc.okey">{{ loc.name }}</ion-select-option>
                  }
                </ion-select>
              </ion-col>
            } @else {
              <ion-col size="12">
                <ion-select [label]="i18n().weather_locations_label()" labelPlacement="stacked"
                            multiple="true" [value]="locationKeys()" [disabled]="readOnly()"
                            [placeholder]="i18n().weather_locations_helper()"
                            (ionChange)="onChange('locationKeys', $event.detail.value)">
                  @for (loc of locations(); track loc.okey) {
                    <ion-select-option [value]="loc.okey">{{ loc.name }}</ion-select-option>
                  }
                </ion-select>
              </ion-col>
            }

            @if (variant() === 'forecast_overview') {
              <ion-col size="12" size-md="6">
                <ion-select [label]="i18n().weather_orientation_label()" labelPlacement="stacked"
                            [value]="orientation()" [disabled]="readOnly()"
                            (ionChange)="onChange('orientation', $event.detail.value)">
                  <ion-select-option value="horizontal">horizontal</ion-select-option>
                  <ion-select-option value="vertical">vertical</ion-select-option>
                </ion-select>
              </ion-col>
            }

            @if (showsDays()) {
              <ion-col size="12" size-md="6">
                <ion-select [label]="i18n().weather_days_label()" labelPlacement="stacked"
                            [value]="days()" [disabled]="readOnly()"
                            (ionChange)="onChange('days', $event.detail.value)">
                  @for (d of dayOptions; track d) {
                    <ion-select-option [value]="d">{{ d }}</ion-select-option>
                  }
                </ion-select>
              </ion-col>
            }
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>
  `
})
export class WeatherConfiguration {
  public formData = model.required<WeatherConfig>();
  public readonly readOnly = input(true);
  public readonly i18n = input.required<WeatherConfigI18n>();
  /** All locations the tenant may pick from. Empty is allowed — the select is then empty. */
  public readonly locations = input<WeatherLocationOption[]>([]);

  protected readonly variants: WeatherVariant[] = [
    'day-horizontal', 'day-vertical', 'forecast_overview', 'forecast_detail',
    'forecast_table', 'hourly_detail', 'map', 'rain_radar'
  ];
  protected readonly dayOptions = [1, 2, 3, 4, 5, 6, 7];

  protected variant = linkedSignal(() => this.formData().variant ?? 'day-horizontal');
  protected locationKey = linkedSignal(() => this.formData().locationKey ?? '');
  protected locationKeys = linkedSignal(() => this.formData().locationKeys ?? []);
  protected orientation = linkedSignal(() => this.formData().orientation ?? 'horizontal');
  protected days = linkedSignal(() => this.formData().days ?? 6);

  protected showsDays = computed(() =>
    this.variant() === 'forecast_overview' || this.variant() === 'forecast_table');

  protected onChange(field: keyof WeatherConfig, value: unknown): void {
    this.formData.update((vm) => ({ ...vm, [field]: value }));
  }
}

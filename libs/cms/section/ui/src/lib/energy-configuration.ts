import { Component, computed, input, linkedSignal, model, Signal } from '@angular/core';
import {
  IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonNote, IonRow,
  IonSelect, IonSelectOption
} from '@ionic/angular';

import { SectionErrors, getFieldErrors } from '@okr/cms-section-util';
import { EnergyConfig } from '@okr/shared-models';
import { ErrorNote } from '@okr/shared-ui';

import { WeatherLocationOption } from './weather-configuration';

interface EnergyConfigI18n {
  energy_title:           Signal<string>;
  energy_location_label:  Signal<string>;
  energy_location_helper: Signal<string>;
  energy_compare_label:   Signal<string>;
  energy_compare_helper:  Signal<string>;
}

/**
 * Configuration of an energy section (spec 2026-11-04 §6.1): the municipality (required, never
 * inherited from the page) and up to four others for the comparison table. The caller offers
 * `city` locations only; the validation suite checks the count and that the main municipality is not
 * compared with itself.
 */
@Component({
  selector: 'okr-energy-config',
  standalone: true,
  imports: [
    IonRow, IonCol, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonGrid, IonNote,
    IonSelect, IonSelectOption, ErrorNote
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px; } }`],
  template: `
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ i18n().energy_title() }}</ion-card-title>
      </ion-card-header>
      <ion-card-content>
        <ion-grid>
          <ion-row>
            <ion-col size="12" size-md="6">
              <ion-select [label]="i18n().energy_location_label()" labelPlacement="stacked"
                          [value]="locationKey()" [disabled]="readOnly()"
                          [placeholder]="i18n().energy_location_helper()"
                          (ionChange)="onLocation($event.detail.value)">
                @for (loc of locations(); track loc.okey) {
                  <ion-select-option [value]="loc.okey">{{ loc.name }}</ion-select-option>
                }
              </ion-select>
            </ion-col>
            <ion-col size="12" size-md="6">
              <ion-select [label]="i18n().energy_compare_label()" labelPlacement="stacked"
                          multiple="true" [value]="compareKeys()" [disabled]="readOnly()"
                          (ionChange)="onCompare($event.detail.value)">
                @for (loc of compareOptions(); track loc.okey) {
                  <ion-select-option [value]="loc.okey">{{ loc.name }}</ion-select-option>
                }
              </ion-select>
              <ion-note>{{ i18n().energy_compare_helper() }}</ion-note>
              <okr-error-note [errors]="errorsFor('compareKeys')" />
            </ion-col>
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>
  `
})
export class EnergyConfiguration {
  public formData = model.required<EnergyConfig>();
  public readonly readOnly = input(true);
  public readonly i18n = input.required<EnergyConfigI18n>();
  /** vest field name -> messages of the running section suite (see section.form.ts): `energyCompareCount` shows beside the select. */
  public readonly errors = input<SectionErrors>({});
  /** The municipalities the tenant may pick from (type `city`). Empty is allowed — the selects are then empty. */
  public readonly locations = input<WeatherLocationOption[]>([]);

  protected locationKey = linkedSignal(() => this.formData().locationKey ?? '');
  protected compareKeys = linkedSignal(() => this.formData().compareKeys ?? []);

  /** The main municipality is not offered for comparison with itself. */
  protected compareOptions = computed(() => this.locations().filter((loc) => loc.okey !== this.locationKey()));

  protected onLocation(value: string): void {
    // the new main municipality drops out of the comparison: it is no longer offered there, so the editor
    // could not uncheck it, and the suite would reject it
    this.formData.update((vm) => ({
      ...vm,
      locationKey: value,
      compareKeys: (vm.compareKeys ?? []).filter((key) => key !== value)
    }));
  }

  protected onCompare(value: string[]): void {
    const offered = new Set(this.compareOptions().map((loc) => loc.okey));
    // a stored key that is no longer among the locations stays: the select cannot show it, and a
    // change here must not silently delete what the editor never saw
    const kept = (this.formData().compareKeys ?? []).filter((key) => key !== this.locationKey() && !this.locations().some((loc) => loc.okey === key));
    const picked = (value ?? []).filter((key) => offered.has(key));
    this.formData.update((vm) => ({ ...vm, compareKeys: [...picked, ...kept] }));
  }

  /** messages of a single field, for the inline <okr-error-note> */
  protected errorsFor(field: string): string[] {
    return getFieldErrors(this.errors(), field);
  }
}

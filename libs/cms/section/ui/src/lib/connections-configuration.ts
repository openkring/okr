import { Component, input, linkedSignal, model, Signal } from '@angular/core';
import {
  IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonRow,
  IonSelect, IonSelectOption
} from '@ionic/angular';

import { ConnectionsConfig } from '@okr/shared-models';

import { WeatherLocationOption } from './weather-configuration';

interface ConnectionsConfigI18n {
  connections_title:              Signal<string>;
  connections_destination_label:  Signal<string>;
  connections_destination_helper: Signal<string>;
  connections_source_label:       Signal<string>;
  connections_source_helper:      Signal<string>;
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
    IonSelect, IonSelectOption
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

  protected onChange(field: keyof ConnectionsConfig, value: unknown): void {
    this.formData.update((vm) => ({ ...vm, [field]: String(value ?? '') }));
  }
}

import { Component, computed, input, linkedSignal, model, Signal } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonLabel, IonRow } from '@ionic/angular/standalone';

import { Checkbox, CheckboxI18n, NumberInput, NumberInputI18n } from '@bk2/shared-ui';
import { MapConfig } from '@bk2/shared-models';
import { coerceBoolean } from '@bk2/shared-util-core';

interface MapConfigI18n {
    latitude_label:                       Signal<string>;
    latitude_placeholder:                 Signal<string>;
    latitude_helper:                      Signal<string>;
    longitude_label:                      Signal<string>;
    longitude_placeholder:                Signal<string>;
    longitude_helper:                     Signal<string>;
    zoomFactor_label:                     Signal<string>;
    zoomFactor_placeholder:               Signal<string>;
    zoomFactor_helper:                    Signal<string>;
    useCurrentLocationAsCenter_label:     Signal<string>;
    useCurrentLocationAsCenter_helper:    Signal<string>;
};

@Component({
  selector: 'bk-map-config',
  standalone: true,
  imports: [
    IonGrid, IonRow, IonCol, IonLabel, IonCard, IonCardHeader, IonCardTitle, IonCardContent,
    NumberInput, Checkbox
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
       <ion-card>
        <ion-card-header>
          <ion-card-title>{{ title() }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          @if(intro(); as intro) {
            @if(intro.length > 0) {
              <small><div [innerHTML]="intro"></div></small>
            }
          }
          <ion-grid>
            <ion-row>
              <ion-col size="12">
                <ion-label>{{ '@input.coordinates.label' }}</ion-label>
              </ion-col>
            </ion-row>
            <ion-row>
              <ion-col size="12" size-md="6">
                <bk-number-input [i18n]="latitudeI18n()" [value]="centerLatitude()" (valueChange)="onFieldChange('centerLatitude', $event)" [maxLength]=8 [showHelper]=true [readOnly]="isReadOnly()" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-number-input [i18n]="longitudeI18n()" [value]="centerLongitude()" (valueChange)="onFieldChange('centerLongitude', $event)" [maxLength]=7 [showHelper]=true [readOnly]="isReadOnly()" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-number-input [i18n]="zoomFactorI18n()" [value]="zoom()" (valueChange)="onFieldChange('zoom', $event)" [maxLength]=2 [showHelper]=true [readOnly]="isReadOnly()" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-checkbox [i18n]="useCurrentLocationAsCenterI18n()" [checked]="useCurrentLocationAsCenter()" (checkedChange)="onFieldChange('useCurrentLocationAsCenter', $event)" [showHelper]="true" [readOnly]="isReadOnly()" />
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>
  `
})
export class MapConfiguration {
  // inputs
  public i18n = input.required<MapConfigI18n>();

  // derived
  protected latitudeI18n = computed(() => ({ name: 'latitude', label: this.i18n().latitude_label(), placeholder: this.i18n().latitude_placeholder(), helper: this.i18n().latitude_helper() } as NumberInputI18n));
  protected longitudeI18n = computed(() => ({ name: 'longitude', label: this.i18n().longitude_label(), placeholder: this.i18n().longitude_placeholder(), helper: this.i18n().longitude_helper() } as NumberInputI18n));
  protected zoomFactorI18n = computed(() => ({ name: 'zoomFactor', label: this.i18n().zoomFactor_label(), placeholder: this.i18n().zoomFactor_placeholder(), helper: this.i18n().zoomFactor_helper() } as NumberInputI18n));

  protected useCurrentLocationAsCenterI18n = computed(() => ({
    name: 'useCurrentLocationAsCenter',
    label: this.i18n().useCurrentLocationAsCenter_label(),
    helper: this.i18n().useCurrentLocationAsCenter_helper(),
  } as CheckboxI18n));

  // inputs
  public formData = model.required<MapConfig>();
  public title = input('@content.section.type.map.edit');
  public intro = input<string>();
  public readonly readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // tbd: lookup appStore.locationId and use it to determine the default values
  protected centerLatitude = linkedSignal(() => this.formData().centerLatitude ?? '');
  protected centerLongitude= linkedSignal(() => this.formData().centerLongitude ?? '');
  protected zoom = linkedSignal(() => this.formData().zoom ?? '15');
  protected useCurrentLocationAsCenter = linkedSignal(() => this.formData().useCurrentLocationAsCenter ?? false);

  /************************************** actions *********************************************** */
  protected onFieldChange(fieldName: string, fieldValue: string | number | boolean): void {
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }
}

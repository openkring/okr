import { Component, computed, inject, input, linkedSignal, model } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonLabel, IonRow } from '@ionic/angular/standalone';

import { Checkbox, CheckboxI18n, NumberInput, NumberInputI18n } from '@bk2/shared-ui';
import { I18nService } from '@bk2/shared-i18n';
import { PFX } from './scope';
import { MapConfig } from '@bk2/shared-models';
import { coerceBoolean } from '@bk2/shared-util-core';

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
  private readonly i18nService = inject(I18nService);
  protected readonly fieldI18n = this.i18nService.translateAll({
    latitude_label:      PFX + 'latitude.label',
    latitude_placeholder: PFX + 'latitude.placeholder',
    latitude_helper:     PFX + 'latitude.helper',
    longitude_label:     PFX + 'longitude.label',
    longitude_placeholder: PFX + 'longitude.placeholder',
    longitude_helper:    PFX + 'longitude.helper',
    zoomFactor_label:                    PFX + 'zoomFactor.label',
    zoomFactor_placeholder:              PFX + 'zoomFactor.placeholder',
    zoomFactor_helper:                   PFX + 'zoomFactor.helper',
    useCurrentLocationAsCenter_label:    PFX + 'useCurrentLocationAsCenter.label',
    useCurrentLocationAsCenter_helper:   PFX + 'useCurrentLocationAsCenter.helper',
  });
  protected latitudeI18n = computed(() => ({ name: 'latitude', label: this.fieldI18n.latitude_label(), placeholder: this.fieldI18n.latitude_placeholder(), helper: this.fieldI18n.latitude_helper() } as NumberInputI18n));
  protected longitudeI18n = computed(() => ({ name: 'longitude', label: this.fieldI18n.longitude_label(), placeholder: this.fieldI18n.longitude_placeholder(), helper: this.fieldI18n.longitude_helper() } as NumberInputI18n));
  protected zoomFactorI18n = computed(() => ({ name: 'zoomFactor', label: this.fieldI18n.zoomFactor_label(), placeholder: this.fieldI18n.zoomFactor_placeholder(), helper: this.fieldI18n.zoomFactor_helper() } as NumberInputI18n));

  protected useCurrentLocationAsCenterI18n = computed(() => ({
    name: 'useCurrentLocationAsCenter',
    label: this.fieldI18n.useCurrentLocationAsCenter_label(),
    helper: this.fieldI18n.useCurrentLocationAsCenter_helper(),
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

import { AsyncPipe } from '@angular/common';
import { Component, computed, input, linkedSignal, model } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonLabel, IonRow } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { CheckboxComponent, NumberInputComponent } from '@bk2/shared-ui';
import { MapConfig } from '@bk2/shared-models';
import { coerceBoolean } from '@bk2/shared-util-core';

@Component({
  selector: 'bk-map-config',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
    IonGrid, IonRow, IonCol, IonLabel, IonCard, IonCardHeader, IonCardTitle, IonCardContent,
    NumberInputComponent, CheckboxComponent
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
       <ion-card>
        <ion-card-header>
          <ion-card-title>{{ title() | translate | async }}</ion-card-title>
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
                <ion-label>{{ '@input.coordinates.label' | translate | async }}</ion-label>
              </ion-col>
            </ion-row>
            <ion-row>
              <ion-col size="12" size-md="6">
                <bk-number-input name="latitude" [value]="centerLatitude()" (valueChange)="onFieldChange('centerLatitude', $event)" [maxLength]=8 [showHelper]=true [readOnly]="isReadOnly()" />                                        
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-number-input name="longitude" [value]="centerLongitude()" (valueChange)="onFieldChange('centerLongitude', $event)" [maxLength]=7 [showHelper]=true [readOnly]="isReadOnly()" />                                        
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-number-input name="zoomFactor" [value]="zoom()" (valueChange)="onFieldChange('zoom', $event)" [maxLength]=2 [showHelper]=true [readOnly]="isReadOnly()" />                                        
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-checkbox name="useCurrentLocationAsCenter" [checked]="useCurrentLocationAsCenter()" (checkedChange)="onFieldChange('useCurrentLocationAsCenter', $event)" [showHelper]="true" [readOnly]="isReadOnly()" />
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>
  `
})
export class MapConfigComponent {
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

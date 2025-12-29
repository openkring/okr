import { Component, computed, input, linkedSignal, model } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { AsyncPipe } from '@angular/common';

import { CheckboxComponent, NumberInputComponent, StringSelectComponent } from '@bk2/shared-ui';
import { TrackerConfig } from '@bk2/shared-models';
import { coerceBoolean } from '@bk2/shared-util-core';
import { TranslatePipe } from '@bk2/shared-i18n';

@Component({
  selector: 'bk-tracker-config',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
    IonGrid, IonRow, IonCol, IonCard, IonCardContent, IonCardHeader, IonCardTitle,
    CheckboxComponent, NumberInputComponent, StringSelectComponent
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ title() | translate | async }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
                <ion-col size="12" size-md="6">
                <bk-checkbox name="autostart" [checked]="autostart()" (checkedChange)="onFieldChange('autostart', $event)" [showHelper]="true" [readOnly]="readOnly()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                    <bk-number-input name="intervalInSeconds" [value]="intervalInSeconds()" (valueChange)="onFieldChange('intervalInSeconds', $event)" [maxLength]=11 [readOnly]="isReadOnly()" [showHelper]=true />                                        
                </ion-col>
                <ion-col size="12" size-md="6">
                <bk-checkbox name="enableHighAccuracy" [checked]="enableHighAccuracy()" (checkedChange)="onFieldChange('enableHighAccuracy', $event)" [showHelper]="true" [readOnly]="readOnly()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                    <bk-number-input name="maximumAge" [value]="maximumAge()" (valueChange)="onFieldChange('maximumAge', $event)" [maxLength]=6 [readOnly]="isReadOnly()" [showHelper]=true />                                        
                </ion-col>
                <ion-col size="12" size-md="6">
                <bk-string-select name="exportFormat"  [selectedString]="exportFormat()" (selectedStringChange)="onFieldChange('exportFormat', $event)" [readOnly]="readOnly()" [stringList] = "['kmz', 'json', 'csv']" /> 
                </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>
    `
})
export class TrackerConfigComponent {
  // inputs
  public formData = model.required<TrackerConfig>();
  public title = input('@content.section.type.tracker.edit');
  public readonly readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // linked signals (fields)
  protected autostart = linkedSignal(() => this.formData().autostart ?? false);
  protected intervalInSeconds = linkedSignal(() => this.formData().intervalInSeconds ?? 60);
  protected enableHighAccuracy = linkedSignal(() => this.formData().enableHighAccuracy ?? false);
  protected maximumAge = linkedSignal(() => this.formData().maximumAge ?? 0);
  protected exportFormat = linkedSignal(() => this.formData().exportFormat ?? 'csv');

  /************************************** actions *********************************************** */
  protected onFieldChange(fieldName: string, fieldValue: string | number | boolean): void {
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }
} 
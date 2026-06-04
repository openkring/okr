import { Component, computed, inject, input, linkedSignal, model, Signal } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { Checkbox, CheckboxI18n, NumberInput, NumberInputI18n, StringSelect, StringSelectI18n } from '@bk2/shared-ui';
import { TrackerConfig } from '@bk2/shared-models';
import { coerceBoolean } from '@bk2/shared-util-core';

interface TrackerConfigI18n {
  tracker_title:                 Signal<string>;
  tracker_intervalInSeconds_label:       Signal<string>,
  tracker_intervalInSeconds_placeholder: Signal<string>,
  tracker_intervalInSeconds_helper:      Signal<string>,
  tracker_maximumAge_label:              Signal<string>,
  tracker_maximumAge_placeholder:        Signal<string>,
  tracker_maximumAge_helper:             Signal<string>,
  tracker_exportFormat_label:            Signal<string>,
  tracker_autostart_label:               Signal<string>,
  tracker_autostart_helper:              Signal<string>,
  tracker_enableHighAccuracy_label:      Signal<string>,
  tracker_enableHighAccuracy_helper:     Signal<string>,
}

@Component({
  selector: 'bk-tracker-config',
  standalone: true,
  imports: [
    IonGrid, IonRow, IonCol, IonCard, IonCardContent, IonCardHeader, IonCardTitle,
    Checkbox, NumberInput, StringSelect
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ i18n().tracker_title() }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
                <ion-col size="12" size-md="6">
                  <bk-checkbox [i18n]="autostartI18n()" [checked]="autostart()" (checkedChange)="onFieldChange('autostart', $event)" [showHelper]="true" [readOnly]="readOnly()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <bk-number-input [i18n]="intervalInSecondsI18n()" [value]="intervalInSeconds()" (valueChange)="onFieldChange('intervalInSeconds', $event)" [maxLength]=11 [readOnly]="isReadOnly()" [showHelper]=true />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <bk-checkbox [i18n]="enableHighAccuracyI18n()" [checked]="enableHighAccuracy()" (checkedChange)="onFieldChange('enableHighAccuracy', $event)" [showHelper]="true" [readOnly]="readOnly()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <bk-number-input [i18n]="maximumAgeI18n()" [value]="maximumAge()" (valueChange)="onFieldChange('maximumAge', $event)" [maxLength]=6 [readOnly]="isReadOnly()" [showHelper]=true />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <bk-string-select [i18n]="exportFormatI18n()" [selectedString]="exportFormat()" (selectedStringChange)="onFieldChange('exportFormat', $event)" [readOnly]="readOnly()" [stringList]="['kmz', 'json', 'csv']" />
                </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>
    `
})
export class TrackerConfiguration {
  // inputs
  public formData = model.required<TrackerConfig>();
  public readonly readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  public readonly i18n = input.required<TrackerConfigI18n>();

  // linked signals (fields)
  protected autostart = linkedSignal(() => this.formData().autostart ?? false);
  protected intervalInSeconds = linkedSignal(() => this.formData().intervalInSeconds ?? 60);
  protected enableHighAccuracy = linkedSignal(() => this.formData().enableHighAccuracy ?? false);
  protected maximumAge = linkedSignal(() => this.formData().maximumAge ?? 0);
  protected exportFormat = linkedSignal(() => this.formData().exportFormat ?? 'csv');

  protected intervalInSecondsI18n = computed(() => ({
    name: 'intervalInSeconds',
    label: this.i18n().tracker_intervalInSeconds_label(),
    placeholder: this.i18n().tracker_intervalInSeconds_placeholder(),
    helper: this.i18n().tracker_intervalInSeconds_helper(),
  } as NumberInputI18n));

  protected maximumAgeI18n = computed(() => ({
    name: 'maximumAge',
    label: this.i18n().tracker_maximumAge_label(),
    placeholder: this.i18n().tracker_maximumAge_placeholder(),
    helper: this.i18n().tracker_maximumAge_helper(),
  } as NumberInputI18n));
  protected exportFormatI18n = computed(() => ({ name: 'exportFormat', label: this.i18n().tracker_exportFormat_label() } as StringSelectI18n));

  protected autostartI18n = computed(() => ({
    name: 'autostart',
    label: this.i18n().tracker_autostart_label(),
    helper: this.i18n().tracker_autostart_helper(),
  } as CheckboxI18n));

  protected enableHighAccuracyI18n = computed(() => ({
    name: 'enableHighAccuracy',
    label: this.i18n().tracker_enableHighAccuracy_label(),
    helper: this.i18n().tracker_enableHighAccuracy_helper(),
  } as CheckboxI18n));

  /************************************** actions *********************************************** */
  protected onFieldChange(fieldName: string, fieldValue: string | number | boolean): void {
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }
}

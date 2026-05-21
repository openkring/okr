import { Component, computed, inject, input, linkedSignal, model } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { Checkbox, CheckboxI18n, NumberInput, NumberInputI18n, StringSelect, StringSelectI18n } from '@bk2/shared-ui';
import { TrackerConfig } from '@bk2/shared-models';
import { coerceBoolean } from '@bk2/shared-util-core';
import { I18nService } from '@bk2/shared-i18n';

import { PFX } from './scope';

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
          <ion-card-title>{{ title() }}</ion-card-title>
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
  private readonly i18nService = inject(I18nService);

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

  protected readonly fieldI18n = this.i18nService.translateAll({
    intervalInSeconds_label:       PFX + 'intervalInSeconds.label',
    intervalInSeconds_placeholder: PFX + 'intervalInSeconds.placeholder',
    intervalInSeconds_helper:      PFX + 'intervalInSeconds.helper',
    maximumAge_label:              PFX + 'maximumAge.label',
    maximumAge_placeholder:        PFX + 'maximumAge.placeholder',
    maximumAge_helper:             PFX + 'maximumAge.helper',
    exportFormat_label:            PFX + 'exportFormat.label',
    autostart_label:               PFX + 'autostart.label',
    autostart_helper:              PFX + 'autostart.helper',
    enableHighAccuracy_label:      PFX + 'enableHighAccuracy.label',
    enableHighAccuracy_helper:     PFX + 'enableHighAccuracy.helper',
  });

  protected intervalInSecondsI18n = computed(() => ({
    name: 'intervalInSeconds',
    label: this.fieldI18n.intervalInSeconds_label(),
    placeholder: this.fieldI18n.intervalInSeconds_placeholder(),
    helper: this.fieldI18n.intervalInSeconds_helper(),
  } as NumberInputI18n));

  protected maximumAgeI18n = computed(() => ({
    name: 'maximumAge',
    label: this.fieldI18n.maximumAge_label(),
    placeholder: this.fieldI18n.maximumAge_placeholder(),
    helper: this.fieldI18n.maximumAge_helper(),
  } as NumberInputI18n));
  protected exportFormatI18n = computed(() => ({ name: 'exportFormat', label: this.fieldI18n.exportFormat_label() } as StringSelectI18n));

  protected autostartI18n = computed(() => ({
    name: 'autostart',
    label: this.fieldI18n.autostart_label(),
    helper: this.fieldI18n.autostart_helper(),
  } as CheckboxI18n));

  protected enableHighAccuracyI18n = computed(() => ({
    name: 'enableHighAccuracy',
    label: this.fieldI18n.enableHighAccuracy_label(),
    helper: this.fieldI18n.enableHighAccuracy_helper(),
  } as CheckboxI18n));

  /************************************** actions *********************************************** */
  protected onFieldChange(fieldName: string, fieldValue: string | number | boolean): void {
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }
}

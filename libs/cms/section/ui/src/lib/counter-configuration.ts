import { Component, computed, input, linkedSignal, model, Signal } from '@angular/core';
import {
  IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCol, IonGrid, IonRow,
  IonSelect, IonSelectOption
} from '@ionic/angular';

import { COUNTER_UI_TYPES, CounterConfig, CounterDirection, CounterUiType } from '@okr/shared-models';
import { Checkbox, CheckboxI18n, ErrorNote, TextInput, TextInputI18n } from '@okr/shared-ui';
import { COUNTER_LABEL_LENGTH, getFieldErrors, SectionErrors } from '@okr/cms-section-util';

interface CounterConfigI18n {
  counter_title:                    Signal<string>;
  counter_subtitle:                 Signal<string>;
  counter_uiType_label:             Signal<string>;
  counter_uiType_display:           Signal<string>;
  counter_uiType_stepper:           Signal<string>;
  counter_uiType_flip:              Signal<string>;
  counter_uiType_ring:              Signal<string>;
  counter_caption_label:            Signal<string>;
  counter_caption_placeholder:      Signal<string>;
  counter_caption_helper:           Signal<string>;
  counter_showUp_label:             Signal<string>;
  counter_showUp_helper:            Signal<string>;
  counter_showDown_label:           Signal<string>;
  counter_showDown_helper:          Signal<string>;
  counter_showButtonLabels_label:   Signal<string>;
  counter_showButtonLabels_helper:  Signal<string>;
  counter_isAuto_label:             Signal<string>;
  counter_isAuto_helper:            Signal<string>;
  counter_interval_label:           Signal<string>;
  counter_direction_label:          Signal<string>;
  counter_direction_up:             Signal<string>;
  counter_direction_down:           Signal<string>;
}

/** Steps the auto counter offers, in ms; a select, so the value cannot leave the suite's range. */
const INTERVALS = [100, 250, 500, 1000, 2000, 5000, 10_000, 30_000, 60_000, 300_000, 3_600_000];

/**
 * Configuration of a counter section: look, caption, which buttons show, and the auto-count
 * (interval and direction only matter — and only show — while `isAuto` is on).
 */
@Component({
  selector: 'okr-counter-config',
  standalone: true,
  imports: [
    Checkbox, TextInput, ErrorNote,
    IonCard, IonCardHeader, IonCardTitle, IonCardSubtitle, IonCardContent, IonGrid, IonRow, IonCol,
    IonSelect, IonSelectOption
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px; } }`],
  template: `
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ i18n().counter_title() }}</ion-card-title>
        <ion-card-subtitle>{{ i18n().counter_subtitle() }}</ion-card-subtitle>
      </ion-card-header>
      <ion-card-content>
        <ion-grid>
          <ion-row>
            <ion-col size="12" size-md="6">
              <ion-select [label]="i18n().counter_uiType_label()" labelPlacement="stacked"
                          [value]="uiType()" [disabled]="readOnly()"
                          (ionChange)="onFieldChange('uiType', $event.detail.value)">
                @for (t of uiTypes; track t) {
                  <ion-select-option [value]="t">{{ uiTypeLabels()[t] }}</ion-select-option>
                }
              </ion-select>
              <okr-error-note [errors]="errorsFor('counter.uiType')" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <okr-text-input [i18n]="captionI18n()" [value]="label()" (valueChange)="onFieldChange('label', $event)"
                              [maxLength]="labelLength" [readOnly]="readOnly()" [showHelper]="true" />
              <okr-error-note [errors]="errorsFor('counter.label')" />
            </ion-col>
          </ion-row>
          <ion-row>
            <ion-col size="12" size-md="6">
              <okr-checkbox [i18n]="showUpI18n()" [checked]="showUpButton()" (checkedChange)="onFieldChange('showUpButton', $event)"
                            [showHelper]="true" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <okr-checkbox [i18n]="showDownI18n()" [checked]="showDownButton()" (checkedChange)="onFieldChange('showDownButton', $event)"
                            [showHelper]="true" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <okr-checkbox [i18n]="showButtonLabelsI18n()" [checked]="showButtonLabels()" (checkedChange)="onFieldChange('showButtonLabels', $event)"
                            [showHelper]="true" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <okr-checkbox [i18n]="isAutoI18n()" [checked]="isAuto()" (checkedChange)="onFieldChange('isAuto', $event)"
                            [showHelper]="true" [readOnly]="readOnly()" />
            </ion-col>
          </ion-row>
          @if (isAuto()) {
            <ion-row>
              <ion-col size="12" size-md="6">
                <ion-select [label]="i18n().counter_interval_label()" labelPlacement="stacked"
                            [value]="autoInterval()" [disabled]="readOnly()"
                            (ionChange)="onFieldChange('autoInterval', $event.detail.value)">
                  @for (ms of intervals; track ms) {
                    <ion-select-option [value]="ms">{{ formatInterval(ms) }}</ion-select-option>
                  }
                </ion-select>
                <okr-error-note [errors]="errorsFor('counter.autoInterval')" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <ion-select [label]="i18n().counter_direction_label()" labelPlacement="stacked"
                            [value]="autoDirection()" [disabled]="readOnly()"
                            (ionChange)="onFieldChange('autoDirection', $event.detail.value)">
                  <ion-select-option value="up">{{ i18n().counter_direction_up() }}</ion-select-option>
                  <ion-select-option value="down">{{ i18n().counter_direction_down() }}</ion-select-option>
                </ion-select>
                <okr-error-note [errors]="errorsFor('counter.autoDirection')" />
              </ion-col>
            </ion-row>
          }
        </ion-grid>
      </ion-card-content>
    </ion-card>
  `
})
export class CounterConfiguration {
  public formData = model.required<CounterConfig>();
  public readonly readOnly = input(true);
  public readonly i18n = input.required<CounterConfigI18n>();
  /** vest field name -> messages of the running section suite (see section.form.ts) */
  public readonly errors = input<SectionErrors>({});

  protected readonly uiTypes = COUNTER_UI_TYPES;
  protected readonly intervals = INTERVALS;
  protected readonly labelLength = COUNTER_LABEL_LENGTH;

  protected uiType = linkedSignal<CounterUiType>(() => this.formData().uiType ?? 'display');
  protected label = linkedSignal(() => this.formData().label ?? '');
  protected showUpButton = linkedSignal(() => this.formData().showUpButton ?? true);
  protected showDownButton = linkedSignal(() => this.formData().showDownButton ?? true);
  protected showButtonLabels = linkedSignal(() => this.formData().showButtonLabels ?? false);
  protected isAuto = linkedSignal(() => this.formData().isAuto ?? false);
  protected autoInterval = linkedSignal(() => this.formData().autoInterval ?? 1000);
  protected autoDirection = linkedSignal<CounterDirection>(() => this.formData().autoDirection ?? 'up');

  protected uiTypeLabels = computed<Record<CounterUiType, string>>(() => {
    const i = this.i18n();
    return {
      display: i.counter_uiType_display(),
      stepper: i.counter_uiType_stepper(),
      flip: i.counter_uiType_flip(),
      ring: i.counter_uiType_ring(),
    };
  });

  protected captionI18n = computed(() => ({
    name: 'label',
    label: this.i18n().counter_caption_label(),
    placeholder: this.i18n().counter_caption_placeholder(),
    helper: this.i18n().counter_caption_helper(),
  } as TextInputI18n));

  protected showUpI18n = computed(() => this.checkboxI18n('showUpButton', this.i18n().counter_showUp_label(), this.i18n().counter_showUp_helper()));
  protected showDownI18n = computed(() => this.checkboxI18n('showDownButton', this.i18n().counter_showDown_label(), this.i18n().counter_showDown_helper()));
  protected showButtonLabelsI18n = computed(() => this.checkboxI18n('showButtonLabels', this.i18n().counter_showButtonLabels_label(), this.i18n().counter_showButtonLabels_helper()));
  protected isAutoI18n = computed(() => this.checkboxI18n('isAuto', this.i18n().counter_isAuto_label(), this.i18n().counter_isAuto_helper()));

  /** 500 → «500 ms», 2000 → «2 s», 300000 → «5 min» */
  protected formatInterval(ms: number): string {
    if (ms < 1000) return `${ms} ms`;
    if (ms < 60_000) return `${ms / 1000} s`;
    return `${ms / 60_000} min`;
  }

  protected onFieldChange(field: keyof CounterConfig, value: unknown): void {
    this.formData.update((vm) => ({ ...vm, [field]: value }));
  }

  /** messages of a single field, for the inline <okr-error-note> */
  protected errorsFor(field: string): string[] {
    return getFieldErrors(this.errors(), field);
  }

  private checkboxI18n(name: string, label: string, helper: string): CheckboxI18n {
    return { name, label, helper } as CheckboxI18n;
  }
}

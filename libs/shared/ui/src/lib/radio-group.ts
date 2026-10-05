import { Component, computed, input, model } from '@angular/core';
import { IonItem, IonLabel, IonNote, IonRadio, IonRadioGroup } from '@ionic/angular/standalone';

import { coerceBoolean } from '@okr/shared-util-core';

export interface RadioGroupI18n {
  name: string;
  label: string;
  helper?: string;
}

/**
 * Single choice out of a short list, all options visible at once (use okr-string-select for a long list).
 *
 * Usage example:
 *  <okr-radio-group [i18n]="genderI18n()" [stringList]="['male', 'female']" [labels]="genderLabels()"
 *    [selectedString]="gender()" (selectedStringChange)="onFieldChange('gender', $event)" [readOnly]="false" />
 */
@Component({
  selector: 'okr-radio-group',
  standalone: true,
  imports: [IonItem, IonLabel, IonNote, IonRadioGroup, IonRadio],
  styles: [`
    .group-label { font-size: 12px; color: var(--ion-color-medium); }
    ion-item.option { --min-height: 36px; }
    ion-item.helper { --min-height: 0; }
  `],
  template: `
    <ion-item lines="none">
      <ion-label class="group-label">{{ i18n().label }}</ion-label>
    </ion-item>
    <ion-radio-group [name]="i18n().name" [value]="selectedString()" (ionChange)="selectedString.set($event.detail.value)">
      @for (value of stringList(); track value; let i = $index) {
        <ion-item lines="none" class="option">
          <ion-radio [value]="value" labelPlacement="end" justify="start" [disabled]="isReadOnly()">
            <span class="ion-text-wrap">{{ labels()[i] || value }}</span>
          </ion-radio>
        </ion-item>
      }
    </ion-radio-group>
    @if (i18n().helper) {
      <ion-item lines="none" class="helper">
        <ion-note>{{ i18n().helper }}</ion-note>
      </ion-item>
    }
  `,
})
export class RadioGroup {
  // inputs
  public readonly i18n = input.required<RadioGroupI18n>();
  public selectedString = model(''); // the selected value, two-way bound
  public readonly stringList = input.required<string[]>(); // the option values
  /** optional labels, parallel to stringList; falls back to the raw value */
  public readonly labels = input<string[]>([]);
  public readonly readOnly = input.required<boolean>();

  // coerced boolean inputs
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
}

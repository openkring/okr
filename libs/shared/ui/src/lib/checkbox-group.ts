import { Component, computed, input, model } from '@angular/core';
import { IonCheckbox, IonItem, IonLabel, IonNote } from '@ionic/angular/standalone';

import { coerceBoolean } from '@okr/shared-util-core';

export interface CheckboxGroupI18n {
  name: string;
  label: string;
  helper?: string;
}

/**
 * Multiple choice: one checkbox per option, the value is the list of checked option values
 * (in the order of stringList). For a single yes/no use okr-checkbox.
 *
 * Usage example:
 *  <okr-checkbox-group [i18n]="interestsI18n()" [stringList]="interests" [labels]="interestLabels()"
 *    [selectedStrings]="selected()" (selectedStringsChange)="onFieldChange('interests', $event)" [readOnly]="false" />
 */
@Component({
  selector: 'okr-checkbox-group',
  standalone: true,
  imports: [IonItem, IonLabel, IonNote, IonCheckbox],
  styles: [`
    .group-label { font-size: 12px; color: var(--ion-color-medium); }
    ion-item.option { --min-height: 36px; }
    ion-item.helper { --min-height: 0; }
  `],
  template: `
    <ion-item lines="none">
      <ion-label class="group-label">{{ i18n().label }}</ion-label>
    </ion-item>
    @for (value of stringList(); track value; let i = $index) {
      <ion-item lines="none" class="option">
        <ion-checkbox [name]="i18n().name" [value]="value" [checked]="isChecked(value)"
          (ionChange)="toggle(value, $event.detail.checked)"
          labelPlacement="end" justify="start" [disabled]="isReadOnly()">
          <span class="ion-text-wrap">{{ labels()[i] || value }}</span>
        </ion-checkbox>
      </ion-item>
    }
    @if (i18n().helper) {
      <ion-item lines="none" class="helper">
        <ion-note>{{ i18n().helper }}</ion-note>
      </ion-item>
    }
  `,
})
export class CheckboxGroup {
  // inputs
  public readonly i18n = input.required<CheckboxGroupI18n>();
  public selectedStrings = model<string[]>([]); // the checked values, two-way bound
  public readonly stringList = input.required<string[]>(); // the option values
  /** optional labels, parallel to stringList; falls back to the raw value */
  public readonly labels = input<string[]>([]);
  public readonly readOnly = input.required<boolean>();

  // coerced boolean inputs
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  protected isChecked(value: string): boolean {
    return this.selectedStrings().includes(value);
  }

  protected toggle(value: string, checked: boolean): void {
    const selected = new Set(this.selectedStrings());
    if (checked) selected.add(value); else selected.delete(value);
    // keep the option order, not the click order
    this.selectedStrings.set(this.stringList().filter(v => selected.has(v)));
  }
}

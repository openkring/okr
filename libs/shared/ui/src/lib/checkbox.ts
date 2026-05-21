import { Component, computed, inject, input, model, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonCheckbox, IonIcon, IonItem, IonLabel, IonNote } from '@ionic/angular/standalone';

import { ColorsIonic, getCategoryStringField } from '@bk2/shared-categories';
import { ColorIonic } from '@bk2/shared-models';
import { getSvgIconUrl } from '@bk2/shared-pipes';
import { coerceBoolean } from '@bk2/shared-util-core';
import { ENV } from '@bk2/shared-config';
export type CheckboxLabelPlacement = 'start' | 'end' | 'fixed';
export type CheckboxJustification = 'start' | 'end' | 'space-between';

export interface CheckboxI18n {
  name: string;
  label: string;
  helper: string;
}

@Component({
  selector: 'bk-checkbox',
  standalone: true,
  imports: [
    
    FormsModule,
    IonItem, IonCheckbox, IonNote, IonIcon, IonLabel
  ],
  template: `
    <ion-item lines="none">
      @if (isReadOnly()) { <!-- read-only mode: just show icon and label -->
        <ion-label>
          <ion-icon slot="start" [src]="svgIconUrl()" />
          {{ i18n().label }}
        </ion-label>
      } @else { <!-- editable mode: show checkbox -->
        <ion-checkbox required
          [checked]="checked()"
          (ionChange)="onChange($event.detail.checked)"
          [name]="i18n().name"
          [labelPlacement]="labelPlacement()"
          [justify]="justify()"
          [disabled]="isReadOnly()" 
          [color]="colorName()"
          [indeterminate]="isIndeterminate()"
        >
          <div class="ion-text-wrap">
            {{ i18n().label }}
          </div>
        </ion-checkbox>
      }
    </ion-item>
    @if(shouldShowHelper()) {
      <ion-item lines="none">
        <ion-note>{{ i18n().helper }}</ion-note>
      </ion-item>
    }
  `
})
export class Checkbox {
  private env = inject(ENV);

  // model and explicit output
  public checked = model.required<boolean>(); // current value of the checkbox, two-way bound
  public checkedChange = output<boolean>();

  // inputs
  public i18n = input.required<CheckboxI18n>();
  public readOnly = input.required<boolean>();
  public color = input<ColorIonic>(ColorIonic.Secondary);
  public justify = input<'start'|'end'|'space-between'>('start');
  public showHelper = input<boolean>(false);
  public labelPlacement = input<'start'|'end'|'fixed'>('end'); // placement of the label
  public indeterminate = input<boolean>(false); // if true, the checkbox can be in indeterminate state

  // coerce the booleans
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected shouldShowHelper = computed(() => coerceBoolean(this.showHelper()));
  protected isIndeterminate = computed(() => coerceBoolean(this.indeterminate()));

  // derived values
  protected colorName = computed(() => {
    if (!this.color() || this.color() === ColorIonic.White) return ''; 
    return getCategoryStringField(ColorsIonic, this.color(), 'name');
  });
  protected svgIconUrl = computed(() => getSvgIconUrl(this.env.services.imgixBaseUrl, this.checked() ? 'checkbox-circle' : 'radio-button-off'));

// always emit change
  protected onChange(newValue: boolean): void {
    this.checked.set(newValue);
    this.checkedChange.emit(newValue);
  }
}

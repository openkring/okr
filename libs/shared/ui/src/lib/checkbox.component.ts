import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, model, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonCheckbox, IonIcon, IonItem, IonLabel, IonNote } from '@ionic/angular/standalone';

import { ColorsIonic, getCategoryStringField } from '@bk2/shared-categories';
import { TranslatePipe } from '@bk2/shared-i18n';
import { ColorIonic } from '@bk2/shared-models';
import { getSvgIconUrl } from '@bk2/shared-pipes';
import { coerceBoolean } from '@bk2/shared-util-core';
import { ENV } from '@bk2/shared-config';
export type CheckboxLabelPlacement = 'start' | 'end' | 'fixed';
export type CheckboxJustification = 'start' | 'end' | 'space-between';

@Component({
  selector: 'bk-checkbox',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
    FormsModule,
    IonItem, IonCheckbox, IonNote, IonIcon, IonLabel
  ],
  template: `
    <ion-item lines="none">
      @if (isReadOnly()) { <!-- read-only mode: just show icon and label -->
        <ion-label>
          <ion-icon slot="start" [src]="svgIconUrl()" />
          {{ this.label() | translate | async }}
        </ion-label>
      } @else { <!-- editable mode: show checkbox -->
        <ion-checkbox required
          [checked]="checked()"
          (ionChange)="onChange($event.detail.checked)"
          [name]="name()"
          [labelPlacement]="labelPlacement()"
          [justify]="justify()"
          [disabled]="isReadOnly()" 
          [color]="colorName()"
          [indeterminate]="isIndeterminate()"
        >
          <div class="ion-text-wrap">
            {{ label() | translate | async }}
          </div>
        </ion-checkbox>
      }
    </ion-item>
    @if(shouldShowHelper()) {
      <ion-item lines="none">
        <ion-note>{{ helperText() | translate | async }}</ion-note>
      </ion-item>
    }
  `
})
export class CheckboxComponent {
  private env = inject(ENV);

  // model and explicit output
  public checked = model.required<boolean>(); // current value of the checkbox, two-way bound
  public checkedChange = output<boolean>();

  // inputs
  public name = input.required<string>();   // mandatory name of the form control
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
  protected label = computed(() => `@checkbox.${this.name()}.label`);
  protected helperText = computed(() => `@checkbox.${this.name()}.helperText`);
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

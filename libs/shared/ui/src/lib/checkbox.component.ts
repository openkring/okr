import { AsyncPipe } from '@angular/common';
import { Component, computed, input, linkedSignal, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonCheckbox, IonItem, IonNote } from '@ionic/angular/standalone';

import { ColorsIonic } from '@bk2/shared-categories';
import { TranslatePipe } from '@bk2/shared-i18n';
import { ColorIonic } from '@bk2/shared-models';
import { CategoryPlainNamePipe } from '@bk2/shared-pipes';
export type CheckboxLabelPlacement = 'start' | 'end' | 'fixed';
export type CheckboxJustification = 'start' | 'end' | 'space-between';

@Component({
  selector: 'bk-checkbox',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, CategoryPlainNamePipe,
    FormsModule,
    IonItem, IonCheckbox, IonNote
  ],
  template: `
    <ion-item lines="none">
      <ion-checkbox required
          [name]="name()"
          [labelPlacement]="labelPlacement()"
          [justify]="justify()"
          [checked]="isChecked()"
          [disabled]="readOnly()" 
          [color]="color() | categoryPlainName:colorsIonic"
          [indeterminate]="indeterminate()"
          (ionChange)="onChange()">
          <div class="ion-text-wrap">
          {{ label() | translate | async }}
          </div>
      </ion-checkbox>
    </ion-item>
    @if(showHelper()) {
      <ion-item lines="none">
        <ion-note>{{ helperText() | translate | async }}</ion-note>
      </ion-item>
    }
  `
})
export class CheckboxComponent {
  public name = input.required<string>();   // mandatory name of the form control
  public isChecked = input(false);    // initial value
  public readOnly = input(false);      // if true, the checkbox is read-only
  public color = input<ColorIonic>(ColorIonic.Secondary);
  public justify = input<'start'|'end'|'space-between'>('start');
  public showHelper = input(false);
  public labelPlacement = input<'start'|'end'|'fixed'>('end'); // placement of the label
  public indeterminate = input(false); // if true, the checkbox can be in indeterminate state
  protected label = computed(() => `@checkbox.${this.name()}.label`);
  protected helperText = computed(() => `@checkbox.${this.name()}.helperText`);
  public changed = output<boolean>(); // emits true when the checkbox is checked or unchecked

  private readonly checkState = linkedSignal(() => this.isChecked());
  protected colorsIonic = ColorsIonic;

  protected onChange() {
    this.checkState.set(!this.checkState());    // toggle
    this.changed.emit(this.checkState());    // notify the form about the new value
  }
}

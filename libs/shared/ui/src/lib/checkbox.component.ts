import { AsyncPipe } from '@angular/common';
import { Component, computed, input, linkedSignal, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonCheckbox, IonIcon, IonItem, IonLabel, IonNote } from '@ionic/angular/standalone';

import { ColorsIonic } from '@bk2/shared-categories';
import { TranslatePipe } from '@bk2/shared-i18n';
import { ColorIonic } from '@bk2/shared-models';
import { CategoryPlainNamePipe, SvgIconPipe } from '@bk2/shared-pipes';
import { coerceBoolean } from '@bk2/shared-util-core';
export type CheckboxLabelPlacement = 'start' | 'end' | 'fixed';
export type CheckboxJustification = 'start' | 'end' | 'space-between';

@Component({
  selector: 'bk-checkbox',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, CategoryPlainNamePipe, SvgIconPipe,
    FormsModule,
    IonItem, IonCheckbox, IonNote, IonIcon, IonLabel
  ],
  template: `
    <ion-item lines="none">
      @if (isReadOnly()) {
        <ion-label>
          <ion-icon slot="start" [src]="this.checkedIcon() | svgIcon" />
          {{ this.label() | translate | async }}
        </ion-label>
      } @else {
        <ion-checkbox required
          [name]="name()"
          [labelPlacement]="labelPlacement()"
          [justify]="justify()"
          [checked]="showChecked()"
          [disabled]="isReadOnly()" 
          [color]="color() | categoryPlainName:colorsIonic"
          [indeterminate]="isIndeterminate()"
          (ionChange)="onChange()">
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
  public name = input.required<string>();   // mandatory name of the form control
  public isChecked = input<boolean>(false);    // initial value
  protected showChecked = computed(() => coerceBoolean(this.isChecked()));
  protected checkedIcon = computed(() => this.showChecked() ? 'checkbox-circle' : 'radio-button-off');
  public readOnly = input.required<boolean>();
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  public color = input<ColorIonic>(ColorIonic.Secondary);
  public justify = input<'start'|'end'|'space-between'>('start');
  public showHelper = input<boolean>(false);
  protected shouldShowHelper = computed(() => coerceBoolean(this.showHelper()));
  public labelPlacement = input<'start'|'end'|'fixed'>('end'); // placement of the label
  public indeterminate = input<boolean>(false); // if true, the checkbox can be in indeterminate state
  protected isIndeterminate = computed(() => coerceBoolean(this.indeterminate()));
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

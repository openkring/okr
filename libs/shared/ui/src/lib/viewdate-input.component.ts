import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonInput, ModalController } from '@ionic/angular/standalone';

import { MaskitoDirective } from '@maskito/angular';
import { MaskitoElementPredicate, MaskitoOptions } from '@maskito/core';

import { DATE_LENGTH, InputMode } from '@bk2/shared-constants';
import { TranslatePipe } from '@bk2/shared-i18n';
import { coerceBoolean, DateFormat, getTodayStr } from '@bk2/shared-util-core';
import { ChAnyDate } from '@bk2/shared-config';

/**
 * This ui component enables to input a date in ViewDate format (dd.MM.yyyy) in a text input field.
 * The input field is masked to accept only valid dates.
 * The idea is to use this component embedded with bk-date-input (together with a date picker) to provide a date input field.
 */
@Component({
  selector: 'bk-viewdate-input',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
    FormsModule, MaskitoDirective,
    IonInput
  ],
  template: `
    <ion-input
      type="text"
      [name]="name()"
      [(ngModel)]="viewDate"
      labelPlacement="floating"
      label="{{ label() | translate | async}}"
      placeholder="{{ placeholder() | translate | async }}"
      [inputMode]="inputMode()"
      [maxlength]="maxLength()"
      [autocomplete]="autocomplete()"
      [clearInput]="shouldClearInput()"
      [readonly]="isReadOnly()"
      [maskito]="mask()"
      [maskitoElement]="maskPredicate"
    />
  `
})
export class ViewDateInputComponent {
  protected modalController = inject(ModalController);

  // inputs
  // optional date in ViewDate format (dd.MM.yyyy); default is today
  public viewDate = model(getTodayStr(DateFormat.ViewDate)); 
  public name = input.required<string>(); // mandatory name of the input field
  public readOnly = input.required<boolean>();
  public inputMode = input<InputMode>('numeric'); // A hint to the browser for which keyboard to display.
  public maxLength = input(DATE_LENGTH);
  public clearInput = input(true); // show an icon to clear the input field
  public autocomplete = input('off'); // can be set to bday for birth date
  public mask = input<MaskitoOptions>(ChAnyDate);

  // coerced boolean inputs
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected shouldClearInput = computed(() => coerceBoolean(this.clearInput()));

  // derived fields
  protected label = computed(() => '@input.' + this.name() + '.label');
  protected placeholder = computed(() => '@input.' + this.name() + '.label');

  // passing constants to the template
  readonly maskPredicate: MaskitoElementPredicate = async (el) => (el as HTMLIonInputElement).getInputElement();
}

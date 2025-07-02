import { Component, computed, inject, input, model, output } from '@angular/core';
import { IonInput, IonItem, IonNote, ModalController } from '@ionic/angular/standalone';
import { AsyncPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { MaskitoDirective } from '@maskito/angular';
import { MaskitoElementPredicate, MaskitoOptions } from '@maskito/core';

import { TranslatePipe } from '@bk2/shared/i18n';
import { DateFormat, getTodayStr } from '@bk2/shared/util-core';
import { DATE_LENGTH, InputMode } from '@bk2/shared/constants';
import { ChAnyDate } from '@bk2/shared/config';

/**
 * This ui component enables to input a date in ViewDate format (dd.MM.yyyy) in a text input field.
 * The input field is masked to accept only valid dates.
 * The idea is to use this component embedded with bk-date-input (together with a date picker) to provide a date input field.
 */
@Component({
  selector: 'bk-viewdate-input',
  imports: [
    TranslatePipe, AsyncPipe,
    MaskitoDirective, FormsModule,
    IonItem, IonInput, IonNote
  ],
  styles: [`ion-item.helper { --min-height: 0; }`],
  template: `
  <ion-item lines="none">
    <ion-input (ionChange)="onChange($event)"
      type="text"
      name="{{ name() }}"
      [ngModel]="viewDate()"
      labelPlacement="floating"
      label="{{ label() | translate | async}}"
      placeholder="{{ placeholder() | translate | async }}"
      [inputMode]="inputMode()"
      [maxlength]="maxLength()"
      [autocomplete]="autocomplete()"
      [clearInput]="clearInput()"
      [readonly]="readOnly()"
      [maskito]="mask()"
      [maskitoElement]="maskPredicate"
    />
  </ion-item>
  @if(showHelper()) {
    <ion-item lines="none" class="helper">
      <ion-note>{{'@input.' + name() + '.helper' | translate | async}}</ion-note>
    </ion-item>
  }
  `
})
export class ViewDateInputComponent {
  protected modalController = inject(ModalController);

  // optional date in ViewDate format (dd.MM.yyyy); default is today
  public viewDate = model(getTodayStr(DateFormat.ViewDate)); 
  public name = input.required<string>(); // mandatory name of the input field
  public readOnly = input(false); // if true, the input field is read-only
  public inputMode = input<InputMode>('numeric'); // A hint to the browser for which keyboard to display.
  public maxLength = input(DATE_LENGTH);
  public clearInput = input(true); // show an icon to clear the input field
  public autocomplete = input('off'); // can be set to bday for birth date
  public mask = input<MaskitoOptions>(ChAnyDate);
  public showHelper = input(false);

  public changed = output<string>();  // emits the new value when the input field changes in ViewDate format
  // we need to explicitely notify the change, so that it can be converted in the parent components into StoreDate format

  protected label = computed(() => '@input.' + this.name() + '.label');
  protected placeholder = computed(() => '@input.' + this.name() + '.label');

  protected readonly maskPredicate: MaskitoElementPredicate = async (el: HTMLElement) => (el as HTMLIonInputElement).getInputElement();

  public onChange(event: CustomEvent): void {
    this.viewDate.set(event.detail.value);
    this.changed.emit(this.viewDate());
  }
}

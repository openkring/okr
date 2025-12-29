import { AsyncPipe } from '@angular/common';
import { Component, computed, input, model, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonInput, IonItem, IonNote } from '@ionic/angular/standalone';
import { vestFormsViewProviders } from 'ngx-vest-forms';

import { URL_LENGTH } from '@bk2/shared-constants';
import { TranslatePipe } from '@bk2/shared-i18n';
import { coerceBoolean } from '@bk2/shared-util-core';

import { ButtonCopyComponent } from './button-copy.component';

@Component({
  selector: 'bk-image-url',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
    FormsModule,
    IonItem, IonInput, IonNote,
    ButtonCopyComponent
  ],
  styles: [`ion-item.helper { --min-height: 0; }`],
  viewProviders: [vestFormsViewProviders],
  template: `
    <ion-item lines="none">
      <ion-input (ionInput)="onChange($event)"
        type="url"
        [name]="name()"
        [ngModel]="value()"
        labelPlacement="floating"
        label="{{'@input.' + name() + '.label' | translate | async }}"
        placeholder="{{'@input.' + name() + '.placeholder' | translate | async }}"
        inputmode="url"
        [counter]="!isReadOnly()"
        [maxlength]="maxLength()"
        autocomplete="url"
        [clearInput]="shouldClearInput()"
        [readonly]="isReadOnly()" 
      />
      @if (isCopyable()) {
        <bk-button-copy [value]="value()" />
      }
    </ion-item>
    @if(shouldShowHelper()) {
    <ion-item lines="none" class="helper">
      <ion-note>{{'@input.' + name() + '.helper' | translate | async}}</ion-note>
    </ion-item>
  }
  `
})
export class ImageUrlComponent {
  // inputs
  public value = model.required<string>(); // mandatory view model
  public name = input('url'); // name of the input field
  public readOnly = input.required<boolean>();
  public maxLength = input(URL_LENGTH); // max number of characters allowed
  public copyable = input(true); // if true, a button to copy the value of the input field is shown
  public showHelper = input(false);
  public clearInput = input(true); // show an icon to clear the input field

  // coerced boolean inputs
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected isCopyable = computed(() => coerceBoolean(this.copyable()));
  protected shouldShowHelper = computed(() => coerceBoolean(this.showHelper()));
  protected shouldClearInput = computed(() => coerceBoolean(this.clearInput()));

  // outputs
  public changed = output<string>();

  public onChange(event: CustomEvent): void {
    this.value.set(event.detail.value);
    this.changed.emit(this.value());
  }
}

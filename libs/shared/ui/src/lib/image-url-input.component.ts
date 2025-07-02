import { AsyncPipe } from '@angular/common';
import { Component, input, model, output } from '@angular/core';
import { IonInput, IonItem, IonNote } from '@ionic/angular/standalone';

import { URL_LENGTH } from '@bk2/shared/constants';
import { TranslatePipe } from '@bk2/shared/i18n';
import { ButtonCopyComponent } from './button-copy.component';
import { FormsModule } from '@angular/forms';
import { vestFormsViewProviders } from 'ngx-vest-forms';

@Component({
  selector: 'bk-image-url',
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
        [counter]="!readOnly()"
        [maxlength]="maxLength()"
        autocomplete="url"
        [clearInput]="clearInput()"
        [readonly]="readOnly()" 
      />
      @if (copyable()) {
        <bk-button-copy [value]="value()" />
      }
    </ion-item>
    @if(showHelper()) {
    <ion-item lines="none" class="helper">
      <ion-note>{{'@input.' + name() + '.helper' | translate | async}}</ion-note>
    </ion-item>
  }
  `
})
export class ImageUrlComponent {
  public value = model.required<string>(); // mandatory view model
  public name = input('url'); // name of the input field
  public readOnly = input(false); // if true, the input field is read-only
  public maxLength = input(URL_LENGTH); // max number of characters allowed
  public copyable = input(true); // if true, a button to copy the value of the input field is shown
  public showHelper = input(false);
  public clearInput = input(true); // show an icon to clear the input field
  public changed = output<string>();

  public onChange(event: CustomEvent): void {
    this.value.set(event.detail.value);
    this.changed.emit(this.value());
  }
}

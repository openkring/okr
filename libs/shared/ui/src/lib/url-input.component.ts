import { AsyncPipe } from '@angular/common';
import { Component, computed, input, model, output } from '@angular/core';
import { IonInput, IonItem, IonNote } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared/i18n';
import { URL_LENGTH } from '@bk2/shared/config';
import { ButtonCopyComponent } from './button-copy.component';
import { FormsModule } from '@angular/forms';
import { vestFormsViewProviders } from 'ngx-vest-forms';

@Component({
  selector: 'bk-url',
  imports: [
    TranslatePipe, AsyncPipe,
    FormsModule,
    IonItem, IonInput, IonNote,
    ButtonCopyComponent
  ],
  viewProviders: [vestFormsViewProviders],
  styles: [`ion-item.helper { --min-height: 0; }`],
  template: `
    <ion-item lines="none">
      <ion-input (ionInput)="onChange($event)"
          type="url"
          [name]="name()"
          [ngModel]="value()"
          labelPlacement="floating"
          label="{{label2() | translate | async }}"
          placeholder="{{placeholder2() | translate | async }}"
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
        <ion-note>{{helper2() | translate | async}}</ion-note>
      </ion-item>
    }
  `
})
export class UrlInputComponent {
  public value = model.required<string>(); // mandatory view model
  public name = input('url'); // name of the input field
  public readOnly = input(false); // if true, the input field is read-only
  public maxLength = input(URL_LENGTH); // max number of characters allowed
  public copyable = input(true); // if true, a button to copy the value of the input field is shown
  public showHelper = input(false);
  public clearInput = input(true); // show an icon to clear the input field
  public changed = output<string>();
  public label = input<string>(); // optional custom label of the input field
  public placeholder = input<string>(); // optional custom placeholder of the input field
  public helper = input<string>(); // optional custom helper text of the input field

  protected label2 = computed(() => this.label() ?? `@input.${this.name()}.label`);
  protected placeholder2 = computed(() => this.placeholder() ?? `@input.${this.name()}.placeholder`);
  protected helper2 = computed(() => this.helper() ?? `@input.${this.name()}.helper`);  

  public onChange(event: CustomEvent): void {
    this.value.set(event.detail.value);
    this.changed.emit(this.value());
  }
}

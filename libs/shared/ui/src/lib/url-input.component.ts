import { AsyncPipe } from '@angular/common';
import { Component, computed, input, model, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonInput, IonItem, IonNote } from '@ionic/angular/standalone';
import { vestFormsViewProviders } from 'ngx-vest-forms';

import { URL_LENGTH } from '@bk2/shared-constants';
import { TranslatePipe } from '@bk2/shared-i18n';

import { ButtonCopyComponent } from './button-copy.component';
import { coerceBoolean } from '@bk2/shared-util-core';

@Component({
  selector: 'bk-url',
  standalone: true,
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
        <ion-note>{{helper2() | translate | async}}</ion-note>
      </ion-item>
    }
  `
})
export class UrlInputComponent {
  public value = model.required<string>(); // mandatory view model
  public name = input('url'); // name of the input field
  public readOnly = input.required<boolean>();
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  public maxLength = input(URL_LENGTH); // max number of characters allowed
  public copyable = input(true); // if true, a button to copy the value of the input field is shown
  protected isCopyable = computed(() => coerceBoolean(this.copyable()));
  public showHelper = input(false);
  protected shouldShowHelper = computed(() => coerceBoolean(this.showHelper()));
  public clearInput = input(true); // show an icon to clear the input field
  protected shouldClearInput = computed(() => coerceBoolean(this.clearInput()));
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

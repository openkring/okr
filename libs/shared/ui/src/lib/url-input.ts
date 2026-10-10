import { Component, computed, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonIcon, IonInput, IonItem, IonNote } from '@ionic/angular/standalone';

import { URL_LENGTH } from '@okr/shared-constants';
import { coerceBoolean, getSafeLinkUrl } from '@okr/shared-util-core';
import { SvgIconPipe } from '@okr/shared-pipes';

import { ButtonCopy, ButtonCopyI18n } from './button-copy';
import { SkipClearTab } from './skip-clear-tab.directive';

export interface UrlInputI18n {
  name: string;
  label: string;
  placeholder: string;
  helper?: string;
  copy_conf?: string;
  open?: string;      // tooltip of the open-link icon
}

@Component({
  selector: 'okr-url',
  standalone: true,
  imports: [
    SkipClearTab, SvgIconPipe,
    FormsModule,
    IonItem, IonInput, IonNote, IonIcon,
    ButtonCopy
  ],
  styles: [`
    ion-item.helper { --min-height: 0; }
    a.open-link { display: flex; align-items: center; color: inherit; margin-inline-start: 8px; }
  `],
  template: `
    <ion-item lines="none">
      <ion-input
          type="url"
          [name]="i18n().name"
          [ngModel]="value()"
          (ngModelChange)="value.set($event)"
          labelPlacement="floating"
          [label]="i18n().label"
          [placeholder]="i18n().placeholder"
          inputmode="url"
          [counter]="!isReadOnly()"
          [maxlength]="maxLength()"
          autocomplete="url"
          [clearInput]="shouldClearInput()"
          [readonly]="isReadOnly()"
        />
        @if (isCopyable()) {
          <okr-button-copy [i18n]="buttonCopyI18n()" [value]="value()" tabindex="-1" />
        }
        @if (isOpenable() && safeUrl(); as url) {
          <a class="open-link" slot="end" [href]="url" target="_blank" rel="noopener noreferrer" title="{{ i18n().open ?? '' }}" tabindex="-1">
            <ion-icon src="{{ 'link' | svgIcon }}" />
          </a>
        }
    </ion-item>
    @if(i18n().helper) {
      <ion-item lines="none" class="helper">
        <ion-note>{{ i18n().helper }}</ion-note>
      </ion-item>
    }
  `
})
export class UrlInput {
  // inputs
  public value = model.required<string>(); // mandatory view model
  public i18n = input.required<UrlInputI18n>();
  public readOnly = input.required<boolean>();
  public maxLength = input(URL_LENGTH); // max number of characters allowed
  public copyable = input(true); // if true, a button to copy the value of the input field is shown
  public clearInput = input(true); // show an icon to clear the input field
  public openable = input(false); // if true, an icon opens the (http/https) link in a new tab

  // coerced boolean inputs
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected isCopyable = computed(() => coerceBoolean(this.copyable()));
  protected shouldClearInput = computed(() => coerceBoolean(this.clearInput()));
  protected isOpenable = computed(() => coerceBoolean(this.openable()));
  // only http(s): a stored javascript:/data: link must never become a clickable href
  protected safeUrl = computed(() => getSafeLinkUrl(this.value()));

  protected buttonCopyI18n = computed(() => ({ copy_conf: this.i18n().copy_conf } as ButtonCopyI18n));
}

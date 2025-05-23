import { AsyncPipe } from '@angular/common';
import { Component, inject, input } from '@angular/core';
import { IonButton, IonIcon, ToastController } from '@ionic/angular/standalone';

import { SvgIconPipe } from '@bk2/shared/pipes';
import { copyToClipboard, showToast, TranslatePipe } from '@bk2/shared/i18n';
import { ENV } from '@bk2/shared/config';

@Component({
  selector: 'bk-button-copy',
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe,
    IonIcon, IonButton
  ],
  template: `
  @if (label().length > 0) {
    <ion-button fill="clear" (click)="copyValue()">
      <ion-icon slot="start" src="{{'copy' | svgIcon }}" />
      {{ label() | translate | async }}
    </ion-button>
  } @else {
    <ion-icon slot="end" src="{{'copy' | svgIcon }}" (click)="copyValue()" />
  }
  `
})
export class ButtonCopyComponent {
  private readonly toastController = inject(ToastController);
  private readonly env = inject(ENV);

  public value = input.required<string | number | null | undefined>(); // data to copy
  public label = input(''); // optional label for the button

  public copyValue(): void {
    const _value = this.value();
    if (_value !== undefined && _value !== null) {
      copyToClipboard(_value);
      showToast(this.toastController, '@general.operation.copy.conf', this.env.settingsDefaults.toastLength);  
    }
  }
}

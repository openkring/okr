import { AsyncPipe } from '@angular/common';
import { Component, inject, input } from '@angular/core';
import { IonButton, IonIcon, ToastController } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { copyToClipboard, showToast } from '@bk2/shared-util-angular';

@Component({
  selector: 'bk-button-copy',
  standalone: true,
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

  public value = input.required<string | number | null | undefined>(); // data to copy
  public label = input(''); // optional label for the button

  public copyValue(): void {
    const value = this.value();
    if (value !== undefined && value !== null) {
      copyToClipboard(value);
      showToast(this.toastController, '@general.operation.copy.conf');  
    }
  }
}

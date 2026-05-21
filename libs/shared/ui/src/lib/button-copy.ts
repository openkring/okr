import { Component, computed, inject, input } from '@angular/core';
import { IonButton, IonIcon, ToastController } from '@ionic/angular/standalone';

import { SvgIconPipe } from '@bk2/shared-pipes';
import { copyToClipboard, showToast } from '@bk2/shared-util-angular';
import { coerceBoolean } from '@bk2/shared-util-core';

export interface ButtonCopyI18n {
  copy_conf: string;
}

@Component({
  selector: 'bk-button-copy',
  standalone: true,
  imports: [
    SvgIconPipe,
    IonIcon, IonButton
  ],
  template: `
  @if (label().length > 0 && !isReadOnly()) {
    <ion-button fill="clear" (click)="copyValue()" tabindex="-1">
      <ion-icon slot="start" src="{{'copy' | svgIcon }}" />
      {{ label() }}
    </ion-button>
  } @else {
    <ion-icon slot="end" src="{{'copy' | svgIcon }}" (click)="copyValue()" tabindex="-1" />
  }
  `
})
export class ButtonCopy {
  private readonly toastController = inject(ToastController);

  // inputs
  public i18n = input.required<ButtonCopyI18n>();
  public value = input.required<string | number | null | undefined>(); // data to copy
  public label = input(''); // optional label for the button
  public readOnly = input(false);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  public copyValue(): void {
    const value = this.value();
    if (value !== undefined && value !== null) {
      copyToClipboard(value);
      showToast(this.toastController, this.i18n().copy_conf);  
    }
  }
}

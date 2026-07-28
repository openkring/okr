import { Component, computed, inject, input } from '@angular/core';
import { IonButton, IonIcon, ToastController } from '@ionic/angular/standalone';

import { I18nService } from '@okr/shared-i18n';
import { SvgIconPipe } from '@okr/shared-pipes';
import { copyToClipboardWithConfirmation } from '@okr/shared-util-angular';
import { coerceBoolean } from '@okr/shared-util-core';

export interface ButtonCopyI18n {
  /** Confirmation toast. Optional — falls back to the generic '@copy.conf' message. */
  copy_conf?: string;
}

@Component({
  selector: 'okr-button-copy',
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

  // The confirmation is a generic, domain-agnostic message ('Der Wert wurde kopiert.'), so it is
  // resolved here instead of being threaded through every domain's i18n bundle — most callers never
  // supplied one, which used to surface the developer placeholder as the toast text. A caller that
  // wants a field-specific confirmation can still override it via i18n().copy_conf.
  private readonly defaultI18n = inject(I18nService).translateAll({ copy_conf: '@copy.conf' });
  protected readonly copyConf = computed(() => this.i18n().copy_conf ?? this.defaultI18n.copy_conf());

  public async copyValue(): Promise<void> {
    const value = this.value();
    if (value !== undefined && value !== null) {
      // Await + handle inside copyToClipboardWithConfirmation: on iOS Safari the clipboard
      // fallback can reject ('execCommand copy failed'), which as a fire-and-forget call
      // surfaced as an unhandled promise rejection (SCS-1D). This also shows the success
      // toast only when the copy actually succeeded.
      await copyToClipboardWithConfirmation(this.toastController, value, this.copyConf());
    }
  }
}

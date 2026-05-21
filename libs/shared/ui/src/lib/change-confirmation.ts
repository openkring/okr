import { Component, computed, input, output } from '@angular/core';
import { IonButton, IonButtons, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { ColorsIonic } from '@bk2/shared-categories';
import { ColorIonic } from '@bk2/shared-models';
import { CategoryPlainNamePipe } from '@bk2/shared-pipes';
import { coerceBoolean } from '@bk2/shared-util-core';

export interface ChangeConfirmationI18n {
  ok: string;
  cancel: string;
  confirmation: string;
}

@Component({
  selector: 'bk-change-confirmation',
  standalone: true,
  imports: [
    CategoryPlainNamePipe,
    IonButton, IonToolbar, IonTitle, IonButtons
  ],
  template: `
    <ion-toolbar [color]="color() | categoryPlainName:colorsIonic" mode="md">
      <ion-title>{{ i18n().confirmation }}</ion-title>      
      <ion-buttons slot="end">
        @if(shouldShowCancel()) {
          <ion-button (click)="cancelClicked.emit()">{{ i18n().cancel }}</ion-button>
        }
        <ion-button (click)="okClicked.emit()">{{ i18n().ok }}</ion-button>
      </ion-buttons>
    </ion-toolbar>
  `
})
export class ChangeConfirmation {

  // inputs
  public i18n = input.required<ChangeConfirmationI18n>();
  public showCancel = input(false);
  protected shouldShowCancel = computed(() => coerceBoolean(this.showCancel()));
  public color = input<ColorIonic>(ColorIonic.Warning);

  // outputs
  public okClicked = output(); // event to notify the parent component about ok button clicked
  public cancelClicked = output(); // event to notify the parent component about cancel button clicked

  protected colorsIonic = ColorsIonic;
}

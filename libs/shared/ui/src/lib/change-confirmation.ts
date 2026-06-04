import { Component, input, output } from '@angular/core';
import { IonButton, IonButtons, IonToolbar } from '@ionic/angular/standalone';

import { ColorsIonic } from '@bk2/shared-categories';
import { ColorIonic } from '@bk2/shared-models';
import { CategoryPlainNamePipe } from '@bk2/shared-pipes';

export interface ChangeConfirmationI18n {
  cancel: string;
  save: string;
}

@Component({
  selector: 'bk-change-confirmation',
  standalone: true,
  imports: [
    CategoryPlainNamePipe,
    IonButton, IonToolbar, IonButtons
  ],
  template: `
    <ion-toolbar [color]="color() | categoryPlainName:colorsIonic" mode="md">
      <ion-buttons slot="start">
        <ion-button (click)="cancelClicked.emit()">{{ i18n().cancel }}</ion-button>
      </ion-buttons>
      <ion-buttons slot="end">
        <ion-button (click)="saveClicked.emit()">{{ i18n().save }}</ion-button>
      </ion-buttons>
    </ion-toolbar>
  `
})
export class ChangeConfirmation {
  // inputs
  public i18n = input.required<ChangeConfirmationI18n>();
  public color = input<ColorIonic>(ColorIonic.Warning);

  // outputs
  public saveClicked = output(); // event to notify the parent component about ok button clicked
  public cancelClicked = output(); // event to notify the parent component about cancel button clicked

  protected colorsIonic = ColorsIonic;
}

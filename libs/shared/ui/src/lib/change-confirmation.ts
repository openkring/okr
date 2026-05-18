import { Component, computed, input, output } from '@angular/core';
import { IonButton, IonButtons, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { ColorsIonic } from '@bk2/shared-categories';
import { ColorIonic } from '@bk2/shared-models';
import { CategoryPlainNamePipe } from '@bk2/shared-pipes';
import { coerceBoolean } from '@bk2/shared-util-core';

@Component({
  selector: 'bk-change-confirmation',
  standalone: true,
  imports: [
    CategoryPlainNamePipe,
    IonButton, IonToolbar, IonTitle, IonButtons
  ],
  template: `
    <ion-toolbar [color]="color() | categoryPlainName:colorsIonic" mode="md">
      <ion-title>{{ confirmation() }}</ion-title>      
      <ion-buttons slot="end">
        @if(shouldShowCancel()) {
          <ion-button (click)="cancelClicked.emit()">{{ cancelLabel() }}</ion-button>
        }
        <ion-button (click)="okClicked.emit()">{{ okLabel() }}</ion-button>
      </ion-buttons>
    </ion-toolbar>
  `
})
export class ChangeConfirmation {
  public confirmation = input('@general.operation.change.confirm');
  public okLabel = input('@general.operation.change.ok');
  public cancelLabel = input('@general.operation.change.cancel');
  public showCancel = input(false);
  protected shouldShowCancel = computed(() => coerceBoolean(this.showCancel()));
  public color = input<ColorIonic>(ColorIonic.Warning);

  public okClicked = output(); // event to notify the parent component about ok button clicked
  public cancelClicked = output(); // event to notify the parent component about cancel button clicked

  protected colorsIonic = ColorsIonic;
}

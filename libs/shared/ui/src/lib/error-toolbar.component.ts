import { AsyncPipe } from '@angular/common';
import { Component, input } from '@angular/core';
import { IonItem, IonToolbar } from '@ionic/angular/standalone';

import { ColorsIonic } from '@bk2/shared/categories';
import { TranslatePipe } from '@bk2/shared/i18n';
import { CategoryPlainNamePipe } from '@bk2/shared/pipes';
import { ColorIonic } from '@bk2/shared/models';

@Component({
  selector: 'bk-error-toolbar',
  imports: [
    TranslatePipe, AsyncPipe, CategoryPlainNamePipe,
    IonToolbar, IonItem
  ],
  template: `
    @if(errorMessage(); as errorMessage) {
      <ion-toolbar [color]="color() | categoryPlainName:colorsIonic">
        <ion-item lines="none" [color]="color() | categoryPlainName:colorsIonic">
          {{ errorMessage | translate | async }}
        </ion-item>
      </ion-toolbar>
    }
  `
})
export class ErrorToolbarComponent {
  public errorMessage = input.required<string>();
  public color = input<ColorIonic>(ColorIonic.Danger);


  protected colorsIonic = ColorsIonic;
}

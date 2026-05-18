import { Component, input } from '@angular/core';
import { IonItem, IonToolbar } from '@ionic/angular/standalone';

import { ColorsIonic } from '@bk2/shared-categories';
import { ColorIonic } from '@bk2/shared-models';
import { CategoryPlainNamePipe } from '@bk2/shared-pipes';

@Component({
  selector: 'bk-error-toolbar',
  standalone: true,
  imports: [
    CategoryPlainNamePipe,
    IonToolbar, IonItem
  ],
  template: `
    @if(errorMessage(); as errorMessage) {
      <ion-toolbar [color]="color() | categoryPlainName:colorsIonic">
        <ion-item lines="none" [color]="color() | categoryPlainName:colorsIonic">
          {{ errorMessage }}
        </ion-item>
      </ion-toolbar>
    }
  `
})
export class ErrorToolbar {
  public errorMessage = input.required<string>();
  public color = input<ColorIonic>(ColorIonic.Danger);


  protected colorsIonic = ColorsIonic;
}

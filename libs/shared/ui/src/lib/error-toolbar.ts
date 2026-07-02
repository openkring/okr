import { Component, input } from '@angular/core';
import { IonItem, IonToolbar } from '@ionic/angular/standalone';

import { ColorsIonic } from '@okr/shared-categories';
import { ColorIonic } from '@okr/shared-models';
import { CategoryPlainNamePipe } from '@okr/shared-pipes';

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

import { Component, input } from '@angular/core';
import { IonGrid, IonRow, IonSpinner } from '@ionic/angular/standalone';

import { ColorsIonic } from '@okr/shared-categories';
import { ColorIonic } from '@okr/shared-models';
import { CategoryPlainNamePipe } from '@okr/shared-pipes';

export type BkSpinnerName = 'dots' | 'bubbles' | 'circles' | 'crescent' | 'circular' | 'lines' | 'lines-small' | 'lines-sharp' | 'lines-small-sharp';

@Component({
  selector: 'okr-spinner',
  standalone: true,
  imports: [
    CategoryPlainNamePipe,
    IonGrid, IonRow, IonSpinner
  ],
  styles: [`
    :host {
      display: flex;
      width: 100%;
      height: 100%;
    }
    ion-grid { 
      width: 100%;
      height: 100%; 
      flex-direction: column;
      padding: 0;
      margin: 0;
    }
    ion-row { 
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    ion-spinner { 
      width: 150px; 
      height: 150px; 
      display: block; 
    }
  `],
  template: `
  <ion-grid style="height: 100%">
    <ion-row justify-content-center align-items-center>
      <ion-spinner [name]="name()" [color]="color() | categoryPlainName:colorsIonic" />
    </ion-row>
  </ion-grid>
  `
})
export class Spinner {
  // inputs
  public name = input<BkSpinnerName>('bubbles');
  public color = input<ColorIonic>(ColorIonic.Primary);

  protected colorsIonic = ColorsIonic;
}

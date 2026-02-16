import { Component, input } from '@angular/core';
import { IonGrid, IonRow, IonSpinner } from '@ionic/angular/standalone';

import { ColorsIonic } from '@bk2/shared-categories';
import { ColorIonic } from '@bk2/shared-models';
import { CategoryPlainNamePipe } from '@bk2/shared-pipes';

export type BkSpinnerName = 'dots' | 'bubbles' | 'circles' | 'crescent' | 'circular' | 'lines' | 'lines-small' | 'lines-sharp' | 'lines-small-sharp';

@Component({
  selector: 'bk-spinner',
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
export class SpinnerComponent {
  // inputs
  public name = input<BkSpinnerName>('bubbles');
  public color = input<ColorIonic>(ColorIonic.Primary);

  protected colorsIonic = ColorsIonic;
}

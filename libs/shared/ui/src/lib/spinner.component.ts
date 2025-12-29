import { Component, input } from '@angular/core';
import { IonBackdrop, IonGrid, IonRow, IonSpinner } from '@ionic/angular/standalone';

import { ColorsIonic } from '@bk2/shared-categories';
import { ColorIonic } from '@bk2/shared-models';
import { CategoryPlainNamePipe } from '@bk2/shared-pipes';

export type BkSpinnerName = 'dots' | 'bubbles' | 'circles' | 'crescent' | 'circular' | 'lines' | 'lines-small' | 'lines-sharp' | 'lines-small-sharp';

@Component({
  selector: 'bk-spinner',
  standalone: true,
  imports: [
    CategoryPlainNamePipe,
    IonGrid, IonRow, IonSpinner, IonBackdrop
  ],
  template: `
  <ion-backdrop />
  <ion-grid style="height: 100%">
    <ion-row justify-content-center align-items-center>
      <ion-spinner [name]="name()" [color]="color() | categoryPlainName:colorsIonic" />
    </ion-row>
  </ion-grid>
  `,
  styles: [`
    ion-grid { height: 100%; flex-direction: column; }
    ion-row { height: 100%; }
    ion-spinner { width: 150px; height: 150px; display: block; margin: auto; }
  `]
})
export class SpinnerComponent {
  // inputs
  public name = input<BkSpinnerName>('bubbles');
  public color = input<ColorIonic>(ColorIonic.Primary);

  protected colorsIonic = ColorsIonic;
}

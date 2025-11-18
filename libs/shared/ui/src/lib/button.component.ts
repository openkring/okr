import { Component, computed, input } from '@angular/core';
import { IonButton, IonIcon, IonLabel } from '@ionic/angular/standalone';

import { ColorsIonic } from '@bk2/shared-categories';
import { ColorIonic } from '@bk2/shared-models';
import { CategoryPlainNamePipe, SvgIconPipe } from '@bk2/shared-pipes';
import { coerceBoolean } from '@bk2/shared-util-core';

@Component({
  selector: 'bk-button',
  standalone: true,
  imports: [
    CategoryPlainNamePipe, SvgIconPipe,
    IonButton, IonIcon, IonLabel
  ],
  template: `
  <ion-button [expand]="expand()" [fill]="fill()" [size]="size()" [color]="color() | categoryPlainName:colorsIonic" [disabled]="isDisabled()">
    <ion-icon src="{{iconName() | svgIcon}}" [size]="size()" [slot]="slot()" [style.color]="iconColor" />
      @if (label() && label().length > 0) {
        <ion-label>{{ label() }}</ion-label>
      }
  </ion-button>
  `
})
export class ButtonComponent {
  public label = input('');
  public expand = input<'block'|'full'>('full');
  public fill = input<'clear'|'outline'|'solid'>('solid'); 
  public size = input<'small'|'default'|'large'>('default');
  public color = input<ColorIonic>(ColorIonic.Secondary);
  public disabled = input<boolean>(false);
  protected isDisabled = computed(() => coerceBoolean(this.disabled()));
  public iconName = input<string>('help');
  public slot = input<'start'|'icon-only'|'end'>('start');

  protected iconColor = 'white';
  protected colorsIonic = ColorsIonic;
}

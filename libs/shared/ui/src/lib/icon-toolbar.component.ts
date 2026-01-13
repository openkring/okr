import { Component, input } from '@angular/core';
import { IonAvatar, IonIcon, IonItem, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { ColorsIonic } from '@bk2/shared-categories';
import { ColorIonic } from '@bk2/shared-models';
import { CategoryPlainNamePipe, SvgIconPipe } from '@bk2/shared-pipes';

@Component({
  selector: 'bk-icon-toolbar',
  standalone: true,
  imports: [
    CategoryPlainNamePipe, SvgIconPipe,
    IonToolbar, IonAvatar, IonIcon, IonTitle, IonItem
  ],
  styles: [`
    ion-avatar { margin: auto; height: 60px; width: 60px; padding: 10px; text-align: right; position: relative; }
    ion-avatar img { filter: brightness(0) invert(1);}
    ion-title { margin: auto; width: 100%; text-align: center; padding: 10px; }
    small { text-align: center; display: block; margin-top: 2px; }
  `],
  template: `
  <ion-toolbar [color]="color() | categoryPlainName:colorsIonic">
    <ion-item lines="none" class="ion-align-items-center ion-justify-content-center" [color]="color() | categoryPlainName:colorsIonic">
      <ion-avatar>
        <ion-icon [src]="icon() | svgIcon" size="large" />
        <!-- <ion-img [src]="icon() | svgIcon" [alt]="alt()" /> -->
      </ion-avatar>
    </ion-item>
 
    @if(title()) {
      <ion-item style="padding:0px !important; --min-height: 30px;" color="primary" lines="none">
        <ion-title style="padding:5px !important;">{{ title() }}</ion-title>
      </ion-item>
    }
    @if(subTitle()) {
      <ion-item style="padding:0px !important; --min-height: 30px;" color="primary" lines="none">
        <ion-title style="padding:5px !important;"><small>{{ subTitle() }}</small></ion-title>
      </ion-item>
    }
  </ion-toolbar>
  `,
/*   styles: [`
  ion-thumbnail { margin: auto; height: 100px; width: 100px; padding: 10px; text-align: right; position: relative;}
  ion-title { margin: auto; width: 100%; text-align: center; padding: 10px; }
  `]
 */})
export class IconToolbarComponent {
  // inputs
  public icon = input.required<string>();  
  public alt = input('Avatar Icon');
  public color = input<ColorIonic>(ColorIonic.Primary);
  public title = input<string | undefined>();
  public subTitle = input<string | undefined>();

  // passing constants to the template
  protected colorsIonic = ColorsIonic;
}

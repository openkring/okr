import { Component, input } from '@angular/core';
import { IonImg, IonItem, IonThumbnail, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { ColorsIonic } from '@bk2/shared-categories';
import { ColorIonic } from '@bk2/shared-models';
import { CategoryPlainNamePipe, SvgIconPipe } from '@bk2/shared-pipes';

@Component({
  selector: 'bk-icon-toolbar',
  standalone: true,
  imports: [
    CategoryPlainNamePipe, SvgIconPipe,
    IonToolbar, IonThumbnail, IonImg, IonTitle, IonItem
  ],
  template: `
  <ion-toolbar [color]="color() | categoryPlainName:colorsIonic">
    <ion-thumbnail>
      <ion-img [src]="icon() | svgIcon" [alt]="alt()" />
    </ion-thumbnail>
 
    @if(title()) {
      <ion-item style="padding:0px !important; --min-height: 30px;" color="primary" lines="none">
        <ion-title style="padding:0px !important;">{{ title() }}</ion-title>
      </ion-item>
    }
    @if(subTitle()) {
      <ion-item style="padding:0px !important; --min-height: 30px;" color="primary" lines="none">
        <ion-title style="padding:0px !important;"><small>{{ subTitle() }}</small></ion-title>
      </ion-item>
    }
  </ion-toolbar>
  `,
  styles: [`
  ion-thumbnail { margin: auto; height: 100px; width: 100px; padding: 10px; text-align: right; position: relative;}
  ion-title { margin: auto; width: 100%; text-align: center; padding: 10px; }
  `]
})
export class IconToolbarComponent {
  public icon = input.required<string>();  
  public alt = input('Avatar Icon');
  public color = input<ColorIonic>(ColorIonic.Primary);
  public title = input<string | undefined>();
  public subTitle = input<string | undefined>();

  protected colorsIonic = ColorsIonic;
}

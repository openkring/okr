import { Component, model } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { ColorsIonic } from '@bk2/shared-categories';
import { LowercaseWordMask, SizeMask } from '@bk2/shared-config';
import { Icon } from '@bk2/shared-models';
import { StringSelectComponent, TextInputComponent } from '@bk2/shared-ui';

@Component({
  selector: 'bk-icon-form',
  standalone: true,
  imports: [
    IonGrid, IonRow, IonCol,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonCardSubtitle,
    TextInputComponent, StringSelectComponent
  ],
  template: `
    <ion-row>
      <ion-col size="12"> 
        <ion-card>
          <ion-card-header>
            <ion-card-title>Icon - Konfiguration</ion-card-title>
            <ion-card-subtitle>Definiere ein optionales Icon, das im Button dargestellt wird.</ion-card-subtitle>
          </ion-card-header>
          <ion-card-content>
            <ion-grid>
              <ion-row>
                @if(icon().slot !== 'none') {
                <ion-col size="12" size-md="6">                            <!-- icon name -->           
                  <bk-text-input name="iconName" [value]="icon.name!" [mask]="mask" [showHelper]=true />
                </ion-col>
                <ion-col size="12" size-md="6">                            <!-- icon size -->
                  <bk-text-input name="iconSize" [value]="icon().size ?? ''" [mask]="sizeMask" [maxLength]=3 [showHelper]=true />                             
                </ion-col>
                }
                <ion-col size="12" size-md="6">                            <!-- icon position / slot --> 
                  <bk-string-select name="slot"  [selectedString]="icon().slot ?? 'start'" [stringList] = "['start', 'end', 'icon-only', 'none']" />
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>
      </ion-col>
    </ion-row>
  `
})
export class IconFormComponent {
  public icon = model.required<Icon>();

  protected colorsIonic = ColorsIonic;
  protected mask = LowercaseWordMask;
  protected sizeMask = SizeMask;
}

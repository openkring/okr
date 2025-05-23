

import { AsyncPipe } from '@angular/common';
import { Component, input } from '@angular/core';
import { TranslatePipe } from '@bk2/shared/i18n';
import { IonItem, IonLabel, IonTitle, IonToolbar } from '@ionic/angular/standalone';

/** 
 * A section header consist of a toolbar with a title followed by a description text.
 */
@Component({
  selector: 'bk-section-header',
  imports: [
    TranslatePipe, AsyncPipe,
    IonToolbar, IonTitle, IonItem, IonLabel
  ],
  template: `
  <ion-toolbar color="{{color()}}">
    <ion-title>{{ title() | translate | async }}</ion-title>
  </ion-toolbar> 
  <ion-item lines="none">
    <ion-label>{{ description() | translate | async }}</ion-label>
  </ion-item>   

  `
})
export class SectionHeaderComponent {
  public title = input('');
  public description = input('');
  public color = input('light');
}

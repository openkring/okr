

import { AsyncPipe } from '@angular/common';
import { Component, input } from '@angular/core';
import { IonItem, IonLabel, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';

/** 
 * A section header consist of a toolbar with a title followed by a description text.
 */
@Component({
  selector: 'bk-section-header',
  standalone: true,
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
  // inputs
  public title = input('');
  public description = input('');
  public color = input('light');
}

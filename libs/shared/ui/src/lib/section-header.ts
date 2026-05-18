import { Component, input } from '@angular/core';
import { IonItem, IonLabel, IonTitle, IonToolbar } from '@ionic/angular/standalone';

/** 
 * A section header consist of a toolbar with a title followed by a description text.
 */
@Component({
  selector: 'bk-section-header',
  standalone: true,
  imports: [
    IonToolbar, IonTitle, IonItem, IonLabel
  ],
  template: `
  <ion-toolbar color="{{color()}}">
    <ion-title>{{ title() }}</ion-title>
  </ion-toolbar> 
  <ion-item lines="none">
    <ion-label>{{ description() }}</ion-label>
  </ion-item>   

  `
})
export class SectionHeader {
  // inputs
  public title = input('');
  public description = input('');
  public color = input('light');
}

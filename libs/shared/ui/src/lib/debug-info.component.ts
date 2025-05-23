import { Component, input } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonItem } from '@ionic/angular/standalone';
import { PrettyjsonPipe } from '@bk2/shared/pipes';

@Component({
  selector: 'bk-debug-info',
  imports: [
    PrettyjsonPipe, 
    IonItem, IonCard, IonCardHeader, IonCardTitle, IonCardContent
  ],
  template: `
    @if(isDebug()) {
      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ title() }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
        <ion-item lines="none">
          <small><div [innerHTML]="data() | prettyjson"></div></small>
        </ion-item>
        </ion-card-content>
      </ion-card>
    }
 `
})
export class DebugInfoComponent {
  public title = input('Debug Info');
  public isDebug = input.required<boolean>();
  public data = input.required<unknown>();
}

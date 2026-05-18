import { Component, input } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { LogInfo } from '@bk2/shared-models';

@Component({
  selector: 'bk-result-log',
  standalone: true,
  imports: [
    IonCard, IonCardHeader, IonCardTitle, IonCardContent,
    IonGrid, IonRow, IonCol
  ],
  template: `
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ cardTitle()  }}</ion-card-title>
      </ion-card-header>
      <ion-card-content>
        <ion-grid>
          <ion-row><strong>{{ title() }}</strong></ion-row>
          @for (logEntry of log(); track $index) {
            <ion-row>
              @if(logEntry.id === 'MESSAGE_ONLY') {
                <ion-col size="12"><small>{{ logEntry.message }}</small></ion-col>
              } @else {
                <ion-col size="4"><small>{{ logEntry.id }}</small></ion-col>
                <ion-col size="4"><small>{{ logEntry.name }}</small></ion-col>
                <ion-col size="4"><small>{{ logEntry.message }}</small></ion-col>
              }
            </ion-row>  
          }
        </ion-grid>
      </ion-card-content>
    </ion-card>
  `
})
export class ResultLog {
  // inputs
  public cardTitle = input.required<string>();
  public title = input.required<string>();
  public log = input<LogInfo[]>([]);
}

import { Component, input } from '@angular/core';
import { IonItem, IonLabel, IonToolbar } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared/i18n';
import { AsyncPipe } from '@angular/common';

@Component({
  selector: 'bk-empty-list',
  imports: [
    TranslatePipe, AsyncPipe,
    IonItem, IonLabel, IonToolbar
  ],
  template: `
    <ion-toolbar>
      <ion-item>
        <ion-label>{{ message() | translate | async }}</ion-label>
      </ion-item>
    </ion-toolbar> 
  `,
})
export class EmptyListComponent {
  public message = input('');
}


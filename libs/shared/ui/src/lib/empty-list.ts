import { Component, input } from '@angular/core';
import { IonItem, IonLabel, IonToolbar } from '@ionic/angular/standalone';

@Component({
  selector: 'bk-empty-list',
  standalone: true,
  imports: [
    IonItem, IonLabel, IonToolbar
  ],
  template: `
    <ion-toolbar>
      <ion-item>
        <ion-label>{{ message() ?? 'empty' }}</ion-label>
      </ion-item>
    </ion-toolbar>
  `,
})
export class EmptyList {
  public message = input<string | null>('');
}


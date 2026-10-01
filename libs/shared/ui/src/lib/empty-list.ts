import { Component, input } from '@angular/core';
import { IonItem, IonLabel } from '@ionic/angular/standalone';

/**
 * The message of an empty list: one plain list item on the page background — no toolbar,
 * no card, no white box.
 */
@Component({
  selector: 'okr-empty-list',
  standalone: true,
  imports: [
    IonItem, IonLabel
  ],
  styles: [`ion-item { --background: transparent; }`],
  template: `
    <ion-item lines="none">
      <ion-label>{{ message() ?? 'empty' }}</ion-label>
    </ion-item>
  `,
})
export class EmptyList {
  public message = input<string | null>('');
}

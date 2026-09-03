import { Component, inject, input } from '@angular/core';
import { IonButton, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { Router } from '@angular/router';

import { navigateByUrl } from '@okr/shared-util-angular';

@Component({
  selector: 'okr-more-button',
  standalone: true,
  imports: [
    IonGrid, IonRow, IonCol, IonButton
  ],
  styles: [`
    /* The column sizes to the label and the label never wraps: a fixed size="3" column wrapped
       "Zu Meine Aufgaben" onto two lines on the dashboard cards. */
    ion-button { white-space: nowrap; }
  `],
  template: `
    <ion-grid>
        <ion-row>
            <ion-col size="auto">
                <ion-button expand="block" fill="clear" (click)="openMoreUrl()">
                    {{ label() }}
                </ion-button>
            </ion-col>
        </ion-row>
    </ion-grid>
  `
})
export class MoreButton {
  private router = inject(Router);
  
  // inputs
  public url = input.required<string>();
  public label = input.required<string>();

  protected openMoreUrl(): void {
    navigateByUrl(this.router, this.url());
  }
}

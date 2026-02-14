import { Component, inject, input } from '@angular/core';
import { IonButton, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { Router } from '@angular/router';

import { navigateByUrl } from '@bk2/shared-util-angular';

@Component({
  selector: 'bk-more-button',
  standalone: true,
  imports: [
    IonGrid, IonRow, IonCol, IonButton
  ],
  template: `
    <ion-grid>
        <ion-row>
            <ion-col size="3">
                <ion-button expand="block" fill="clear" (click)="openMoreUrl()">
                    Mehr...
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

  protected openMoreUrl(): void {
    navigateByUrl(this.router, this.url());
  }
}

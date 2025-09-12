import { AsyncPipe } from '@angular/common';
import { Component, input } from '@angular/core';
import { IonCard, IonCardContent, IonItem, IonLabel } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { SectionModel } from '@bk2/shared-models';
import { SpinnerComponent } from '@bk2/shared-ui';

@Component({
  selector: 'bk-missing-section',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
    SpinnerComponent,
    IonCard, IonCardContent, IonLabel, IonItem
  ],
  styles: [`
    ion-card-content { padding: 0px; }
    ion-card { padding: 0px; margin: 0px; border: 0px; box-shadow: none !important;}
    .warning { --background: var(--bk-light-warning-color);}
  `],
  template: `
    @if(section(); as section) {
      <ion-card>
        <ion-card-content>
          <ion-item lines="none" class="warning">
            <ion-label>{{ '@content.section.error.noSuchSection' | translate: { type: section.type } | async }}</ion-label>
          </ion-item>
        </ion-card-content>
      </ion-card>
    } @else {
      <bk-spinner />
    }
  `
})
export class MissingSectionComponent {
  public section = input<SectionModel>();
}
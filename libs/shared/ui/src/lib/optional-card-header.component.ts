import { AsyncPipe } from '@angular/common';
import { Component, input } from '@angular/core';
import { IonCardHeader, IonCardSubtitle, IonCardTitle } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';

@Component({
  selector: 'bk-optional-card-header',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
    IonCardHeader, IonCardTitle, IonCardSubtitle
  ],
  styles: [`
  /* iOS places the subtitle above the title */
  ion-card-header { display: flex; flex-flow: column-reverse; }
`],
  template: `
      @if(title() || subTitle()) {
      <ion-card-header>
        @if(title()) {
          <ion-card-title>{{ title() | translate | async }}</ion-card-title>
        }
        @if(subTitle()) {
          <ion-card-subtitle>{{ subTitle() | translate | async }} </ion-card-subtitle>
        }
      </ion-card-header>
    }
  `
})
export class OptionalCardHeaderComponent {
  // inputs
  public title = input<string | undefined>();
  public subTitle = input<string | undefined>();
}

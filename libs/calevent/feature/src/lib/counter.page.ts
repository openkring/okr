import { Component } from '@angular/core';
import { IonContent } from '@ionic/angular/standalone';

import { Counter, Header } from '@okr/shared-ui';

@Component({
  selector: 'okr-counter-page',
  standalone: true,
  imports: [
    Header, Counter,
    IonContent, 
  ],
  template: `
    <okr-header [i18n]="{ title: 'Counter' }" />
    <ion-content #content>
      <okr-counter />
    </ion-content>
  `,
})
export class CounterPage {  
}




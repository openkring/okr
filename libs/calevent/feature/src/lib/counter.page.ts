import { Component } from '@angular/core';
import { IonContent } from '@ionic/angular/standalone';

import { Counter, Header } from '@bk2/shared-ui';

@Component({
  selector: 'bk-counter-page',
  standalone: true,
  imports: [
    Header, Counter,
    IonContent, 
  ],
  template: `
    <bk-header title="Counter" />
    <ion-content #content>
      <bk-counter />
    </ion-content>
  `,
})
export class CounterPage {  
}




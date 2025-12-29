import { Component } from '@angular/core';
import { IonContent } from '@ionic/angular/standalone';

import { CounterComponent, HeaderComponent } from '@bk2/shared-ui';

@Component({
  selector: 'bk-counter-page',
  standalone: true,
  imports: [
    HeaderComponent, CounterComponent,
    IonContent, 
  ],
  template: `
    <bk-header title="Counter" />
    <ion-content #content>
      <bk-counter />
    </ion-content>
  `,
})
export class CounterPageComponent {  
}




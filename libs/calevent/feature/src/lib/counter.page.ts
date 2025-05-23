import { Component } from '@angular/core';
import { CounterComponent, HeaderComponent } from '@bk2/shared/ui';
import { IonContent } from '@ionic/angular/standalone';

@Component({
  selector: 'bk-counter-page',
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




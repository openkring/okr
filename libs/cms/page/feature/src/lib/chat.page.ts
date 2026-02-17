import { Component } from '@angular/core';
import { IonContent } from '@ionic/angular/standalone';


@Component({
  selector: 'bk-chat-page',
  standalone: true,
  imports: [
    IonContent
  ],
  styles: [`
  bk-section { width: 100%; }
`],
  template: `
    <ion-content>
        hier kommt die chat übersicht
    </ion-content>
  `
})
export class ChatPage {
}

import { Component, input } from '@angular/core';
import { IonButtons, IonContent, IonHeader, IonMenuButton, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { MatrixChat } from '@bk2/chat-feature';


@Component({
  selector: 'bk-chat-page',
  standalone: true,
  imports: [
    MatrixChat, 
    IonContent, IonHeader, IonToolbar, IonButtons, IonTitle, IonMenuButton
  ],
  styles: [`
     :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      width: 100%;
    }
  bk-matrix-chat-overview { width: 100%; display: block; }
  `],
  template: `
    <ion-header>
      <ion-toolbar [color]="color()" id="bkheader">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>      
        <ion-title>Chat</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
        <bk-matrix-chat-overview [showRoomList]="true" />
    </ion-content>
  `
})
export class ChatPage {

  // inputs
  public color = input('secondary');

  // derived signals


}

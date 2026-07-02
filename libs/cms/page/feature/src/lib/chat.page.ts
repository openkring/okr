import { Component, input } from '@angular/core';
import { IonButtons, IonContent, IonHeader, IonMenuButton, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { MatrixChat } from '@okr/chat-feature';


@Component({
  selector: 'okr-chat-page',
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
  okr-matrix-chat-overview { width: 100%; display: block; }
  `],
  template: `
    <ion-header>
      <ion-toolbar [color]="color()" id="bkheader">
        @if(!isGroupView()) {
          <ion-buttons slot="start"><ion-menu-button /></ion-buttons>      
        }
        <ion-title>Chat</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
        <okr-matrix-chat-overview [isGroupView]="isGroupView()" [selectedRoom]="selectedRoom()" />
    </ion-content>
  `
})
export class ChatPage {

  // inputs
  public color = input('secondary');
  public isGroupView = input(false);
  public selectedRoom = input<string | undefined>();

  // derived signals


}

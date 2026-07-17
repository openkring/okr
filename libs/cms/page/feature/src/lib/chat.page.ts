import { Component, input, viewChild } from '@angular/core';
import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonMenuButton, IonPopover, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { SvgIconPipe } from '@okr/shared-pipes';
import { Menu } from '@okr/cms-menu-feature';
import { MatrixChat } from '@okr/chat-feature';


@Component({
  selector: 'okr-chat-page',
  standalone: true,
  imports: [
    MatrixChat, Menu, SvgIconPipe,
    IonContent, IonHeader, IonToolbar, IonButtons, IonTitle, IonMenuButton, IonButton, IonIcon, IonPopover
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
        <!-- room context menu, hoisted from the room-list toolbar; action delegated to MatrixChat -->
        @if(matrixChat()?.canManageRooms()) {
          <ion-buttons slot="end">
            <ion-button [id]="popupId">
              <ion-icon slot="icon-only" src="{{ 'ellipsis-vertical' | svgIcon }}" />
            </ion-button>
            <ion-popover [trigger]="popupId" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true" (ionPopoverDidDismiss)="onContextMenuDismiss($event)">
              <ng-template>
                <ion-content>
                  <okr-menu [menuName]="contextMenuName()" />
                </ion-content>
              </ng-template>
            </ion-popover>
          </ion-buttons>
        }
      </ion-toolbar>
    </ion-header>
    <ion-content>
        <okr-matrix-chat-overview [isGroupView]="isGroupView()" [selectedRoom]="selectedRoom()" [contextMenuName]="contextMenuName()" />
    </ion-content>
  `
})
export class ChatPage {

  // inputs
  public color = input('secondary');
  public isGroupView = input(false);
  public selectedRoom = input<string | undefined>();
  public contextMenuName = input<string>('contextMenuChat');

  // the rendered chat overview — used to delegate the hoisted context-menu action
  protected readonly matrixChat = viewChild(MatrixChat);
  protected readonly popupId = 'c_chat_ctx';

  protected async onContextMenuDismiss($event: CustomEvent): Promise<void> {
    await this.matrixChat()?.onPopoverDismiss($event);
  }
}

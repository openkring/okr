import { Component, computed, inject, input, viewChild } from '@angular/core';
import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonMenuButton, IonPopover, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { SvgIconPipe } from '@okr/shared-pipes';
import { I18nService } from '@okr/shared-i18n';
import { PAGE_I18N_KEYS, PageI18n } from '@okr/cms-page-util';
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
    <!-- own toolbar suppressed in group view, where the chat title/menu/info are hoisted to the group toolbar -->
    @if(!isGroupView()) {
      <ion-header>
        <ion-toolbar [color]="color()" id="bkheader">
          <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
          <ion-title>{{ i18n.chat_type_label() }}</ion-title>
          <!-- room context menu, hoisted from the room-list toolbar; action delegated to MatrixChat -->
          @if(canManageRooms()) {
            <ion-buttons slot="end">
              <!-- present imperatively (not via [trigger]) so a late-rendered button / cached page
                   can't break Ionic's one-shot getElementById trigger wiring -->
              <ion-button (click)="ctxPopover.present($event)">
                <ion-icon slot="icon-only" src="{{ 'ellipsis-vertical' | svgIcon }}" />
              </ion-button>
              <ion-popover #ctxPopover [showBackdrop]="true" [dismissOnSelect]="true" (ionPopoverDidDismiss)="onContextMenuDismiss($event)">
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
    }
    <ion-content>
        <okr-matrix-chat-overview [isGroupView]="isGroupView()" [selectedRoom]="selectedRoom()" [contextMenuName]="contextMenuName()" />
    </ion-content>
  `
})
export class ChatPage {
  protected readonly i18n = inject(I18nService).translateAll(PAGE_I18N_KEYS) as PageI18n;

  // inputs
  public color = input('secondary');
  public isGroupView = input(false);
  public selectedRoom = input<string | undefined>();
  public contextMenuName = input<string>('contextMenuChat');

  // the rendered chat overview — used to delegate the hoisted context-menu action
  protected readonly matrixChat = viewChild(MatrixChat);

  // hoist facade — read/driven by the parent PageDispatcher when this page is embedded in the group view
  public readonly canManageRooms = computed(() => this.matrixChat()?.canManageRooms() ?? false);
  public readonly hasRoom = computed(() => this.matrixChat()?.hasCurrentRoom() ?? false);

  public async openInfo(): Promise<void> {
    await this.matrixChat()?.openChatHelp();
  }

  public async onContextMenuDismiss($event: CustomEvent): Promise<void> {
    await this.matrixChat()?.onPopoverDismiss($event);
  }
}

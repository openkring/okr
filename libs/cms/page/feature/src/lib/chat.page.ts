import { Component, ComponentRef, computed, DestroyRef, effect, inject, input, PLATFORM_ID, signal, untracked, ViewContainerRef, viewChild } from '@angular/core';
import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonMenuButton, IonPopover, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { SvgIconPipe } from '@okr/shared-pipes';
import { I18nService } from '@okr/shared-i18n';
import { PAGE_I18N_KEYS, PageI18n } from '@okr/cms-page-util';
import { Menu } from '@okr/cms-menu-feature';
import { Spinner } from '@okr/shared-ui';
import { isBrowser } from '@okr/shared-util-angular';
import type { MatrixChat } from '@okr/chat-feature';


@Component({
  selector: 'okr-chat-page',
  standalone: true,
  imports: [
    Menu, SvgIconPipe, Spinner,
    IonContent, IonHeader, IonToolbar, IonButtons, IonTitle, IonMenuButton, IonButton, IonIcon, IonPopover
  ],
  styles: [`
     :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      width: 100%;
    }
  .chat-host { width: 100%; display: block; }
  /* Ionic's input-shims scroll padding pushes --keyboard-offset (default 290px, a *guess* at the
     keyboard height) onto ion-content on every focusin — on desktop too, where no keyboard exists.
     That padding shrinks the chat's height:100% and makes the composer jump up. MatrixChat measures
     the real keyboard via visualViewport (--okr-keyboard-inset), so this must stay 0 here.
     !important beats the inline style Ionic writes. */
  ion-content { --keyboard-offset: 0px !important; }
  `],
  template: `
    <!-- own toolbar suppressed in group view, where the chat title/menu/info are hoisted to the group toolbar -->
    @if(!isGroupView()) {
      <ion-header>
        <ion-toolbar [color]="color()" id="bkheader">
          <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
          <ion-title>{{ i18n.chat_type_label() }}</ion-title>
          <!-- room context menu, hoisted from the room-list toolbar; action delegated to MatrixChat -->
          @if(canOpenRoomMenu()) {
            <ion-buttons slot="end">
              <!-- present imperatively (not via [trigger]) so a late-rendered button / cached page
                   can't break Ionic's one-shot getElementById trigger wiring -->
              <ion-button (click)="ctxPopover.present($event)">
                <ion-icon slot="icon-only" src="{{ 'ellipsis-vertical' | svgIcon }}" />
              </ion-button>
              <ion-popover #ctxPopover [showBackdrop]="true" [dismissOnSelect]="true" (ionPopoverDidDismiss)="onContextMenuDismiss($event)">
                <ng-template>
                  <ion-content>
                    <okr-menu [menuName]="contextMenuName()" [toggleStates]="roomMenuToggleStates()" />
                  </ion-content>
                </ng-template>
              </ion-popover>
            </ion-buttons>
          }
        </ion-toolbar>
      </ion-header>
    }
    <ion-content>
        @if (!chatRef()) {
          <okr-spinner />
        }
        <div #chatHost class="chat-host"></div>
    </ion-content>
  `
})
export class ChatPage {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly i18n = inject(I18nService).translateAll(PAGE_I18N_KEYS) as PageI18n;

  // inputs
  public color = input('secondary');
  public isGroupView = input(false);
  public selectedRoom = input<string | undefined>();
  public contextMenuName = input<string>('contextMenuChat');

  // Lazy: a static import of @okr/chat-feature drags matrix-js-sdk into every page that reaches
  // this component (spec 1.49, F1) — same shape as calendar-section.ts's dynamic FullCalendar.
  private chatHost = viewChild('chatHost', { read: ViewContainerRef });
  protected readonly chatRef = signal<ComponentRef<MatrixChat> | undefined>(undefined);

  // hoist facade — read/driven by the parent PageDispatcher when this page is embedded in the group view
  public readonly canManageRooms = computed(() => this.chatRef()?.instance.canManageRooms() ?? false);
  /** Whether to show the ⋮ at all — every signed-in member may pin a room, so this is not the admin gate. */
  public readonly canOpenRoomMenu = computed(() => this.chatRef()?.instance.canOpenRoomMenu() ?? false);
  /** Toggle state for the `chat-room-pin` row, forwarded to <okr-menu>. */
  public readonly roomMenuToggleStates = computed<Record<string, boolean>>(() => this.chatRef()?.instance.roomMenuToggleStates() ?? {});
  public readonly hasRoom = computed(() => this.chatRef()?.instance.hasCurrentRoom() ?? false);

  constructor() {
    effect(async () => {
      const host = this.chatHost();
      if (!host || untracked(() => this.chatRef()) || !isBrowser(this.platformId)) return;
      const { MatrixChat } = await import('@okr/chat-feature');
      const ref = host.createComponent(MatrixChat);
      ref.setInput('isGroupView', untracked(() => this.isGroupView()));
      ref.setInput('selectedRoom', untracked(() => this.selectedRoom()));
      ref.setInput('contextMenuName', untracked(() => this.contextMenuName()));
      this.chatRef.set(ref);
    });
    effect(() => {
      const ref = this.chatRef();
      const isGroupView = this.isGroupView();
      const selectedRoom = this.selectedRoom();
      const contextMenuName = this.contextMenuName();
      if (!ref) return;
      ref.setInput('isGroupView', isGroupView);
      ref.setInput('selectedRoom', selectedRoom);
      ref.setInput('contextMenuName', contextMenuName);
    });
    this.destroyRef.onDestroy(() => this.chatRef()?.destroy());
  }

  public async openInfo(): Promise<void> {
    await this.chatRef()?.instance.openChatHelp();
  }

  public async onContextMenuDismiss($event: CustomEvent): Promise<void> {
    await this.chatRef()?.instance.onPopoverDismiss($event);
  }
}

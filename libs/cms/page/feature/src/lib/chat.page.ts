import { Component, ComponentRef, computed, DestroyRef, effect, inject, input, PLATFORM_ID, signal, untracked, ViewContainerRef, viewChild } from '@angular/core';
import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonMenuButton, IonPopover, IonTitle, IonToolbar } from '@ionic/angular';

import { SvgIconPipe } from '@okr/shared-pipes';
import { I18nService } from '@okr/shared-i18n';
import { PAGE_I18N_KEYS, PageI18n } from '@okr/cms-page-util';
import { Menu, MenuItemsStore } from '@okr/cms-menu-feature';
import { ChatBlockedCard, Spinner } from '@okr/shared-ui';
import { isBrowser } from '@okr/shared-util-angular';
import { ChatStatusService } from '@okr/shared-data-access';
import { AppStore } from '@okr/shared-feature';
import { chatBlockedMessage, chatBlockedSince } from '@okr/shared-util-core';
import type { MatrixChat } from '@okr/chat-feature';


@Component({
  selector: 'okr-chat-page',
  standalone: true,
  imports: [
    Menu, SvgIconPipe, Spinner, ChatBlockedCard,
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
          <ion-buttons slot="end">
            <!-- chat help: room types + keyboard shortcuts (ChatHelpModal, opened by MatrixChat) -->
            <ion-button [attr.aria-label]="i18n.chat_help()" (click)="openInfo()">
              <ion-icon slot="icon-only" src="{{ 'info-circle' | svgIcon }}" />
            </ion-button>
            <!-- room context menu, hoisted from the room-list toolbar; action delegated to MatrixChat -->
            @if(canOpenRoomMenu() && menuItemsStore.canOpen(contextMenuName())) {
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
            }
          </ion-buttons>
        </ion-toolbar>
      </ion-header>
    }
    <ion-content>
      <!-- 1.107: blocked ⇒ the card replaces the chat; MatrixChat is destroyed and not re-created
           (its chunk is never even loaded) until the block is lifted -->
      @if (effectivelyBlocked()) {
        <okr-chat-blocked-card [title]="i18n.chat_blocked_title()" [message]="blockedMessage()" [since]="blockedSince()" />
      } @else {
        @if (!chatRef()) {
          <okr-spinner />
        }
        <div #chatHost class="chat-host"></div>
      }
    </ion-content>
  `
})
export class ChatPage {
  protected readonly menuItemsStore = inject(MenuItemsStore);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly i18n = inject(I18nService).translateAll(PAGE_I18N_KEYS) as PageI18n;
  private readonly appStore = inject(AppStore);
  private readonly chatStatus = inject(ChatStatusService);

  // 1.107 global chat block (exempt testers see the normal chat)
  protected readonly effectivelyBlocked = computed(() =>
    this.chatStatus.isEffectivelyBlocked(this.appStore.currentUser()?.personKey));
  protected readonly blockedMessage = computed(() =>
    chatBlockedMessage(this.chatStatus.message(), this.i18n.chat_blocked_default()));
  protected readonly blockedSince = computed(() =>
    chatBlockedSince(this.chatStatus.status()?.blockedAt, this.i18n.chat_blocked_since()));

  // inputs
  public color = input('secondary');
  public isGroupView = input(false);
  public selectedRoom = input<string | undefined>();
  public eventId = input<string | undefined>();
  public contextMenuName = input<string>('contextMenuChat');

  // Lazy: a static import of @okr/chat-feature drags matrix-js-sdk into every page that reaches
  // this component (spec 1.49, F1) — same shape as calendar-section.ts's dynamic FullCalendar.
  private chatHost = viewChild('chatHost', { read: ViewContainerRef });
  protected readonly chatRef = signal<ComponentRef<MatrixChat> | undefined>(undefined);
  /** Guards against a second mount while the chunk is still in flight. */
  private creatingChat = false;
  private readonly creatingTick = signal(0);
  private destroyed = false;

  // hoist facade — read/driven by the parent PageDispatcher when this page is embedded in the group view
  public readonly canManageRooms = computed(() => this.chatRef()?.instance.canManageRooms() ?? false);
  /** Whether to show the ⋮ at all — every signed-in member may pin a room, so this is not the admin gate. */
  public readonly canOpenRoomMenu = computed(() => this.chatRef()?.instance.canOpenRoomMenu() ?? false);
  /** Toggle state for the `chat-room-pin` row, forwarded to <okr-menu>. */
  public readonly roomMenuToggleStates = computed<Record<string, boolean>>(() => this.chatRef()?.instance.roomMenuToggleStates() ?? {});
  public readonly hasRoom = computed(() => this.chatRef()?.instance.hasCurrentRoom() ?? false);

  constructor() {
    // Pattern A (lazy-loading skill): the effect body stays synchronous and starts the async work
    // itself. `effect(async …)` would hand Angular a promise it ignores, and every signal read
    // after the first await lands outside the tracking context.
    effect(() => {
      const host = this.chatHost();
      const blocked = this.effectivelyBlocked();
      this.creatingTick();
      // 1.107: blocked, or the host vanished with the @else block ⇒ drop the ref. Blocking
      // removes #chatHost, which destroys the component inside it; keeping the dead ref would
      // stop the effect from ever mounting a new one when the block is lifted (the host returns
      // as a fresh element) — the "lazy host in conditional block" trap.
      if (!host || blocked) {
        const ref = untracked(() => this.chatRef());
        if (ref) {
          if (!ref.hostView.destroyed) ref.destroy();
          this.chatRef.set(undefined);
        }
        return;
      }
      // `creating` closes the window the ref guard alone leaves open: between starting the import
      // and setting the ref, a second run would pass the guard and mount a second component.
      if (untracked(() => this.chatRef()) || this.creatingChat || !isBrowser(this.platformId)) return;
      this.creatingChat = true;
      let nudge = false;
      void (async () => {
        try {
          const { MatrixChat } = await import('@okr/chat-feature');
          if (this.destroyed) return;
          // the block may have started, or the host been replaced, while the chunk was in flight:
          // re-run the effect once the guard is released so it acts on the CURRENT host/state
          if (untracked(() => this.effectivelyBlocked()) || untracked(() => this.chatHost()) !== host) {
            nudge = true;
            return;
          }
          const ref = host.createComponent(MatrixChat);
          ref.setInput('isGroupView', untracked(() => this.isGroupView()));
          ref.setInput('selectedRoom', untracked(() => this.selectedRoom()));
          ref.setInput('eventId', untracked(() => this.eventId()));
          ref.setInput('contextMenuName', untracked(() => this.contextMenuName()));
          // first CD pass now: a component destroyed before its first tick (block flips right
          // after mount) otherwise throws in its ngOnDestroy
          ref.changeDetectorRef.detectChanges();
          this.chatRef.set(ref);
        } catch (error) {
          // no nudge: a failed chunk load (offline, stale chunk after a deploy) must not retry in a loop
          console.error('ChatPage: failed to load the chat', error);
        } finally {
          this.creatingChat = false;
          if (nudge) this.creatingTick.update(n => n + 1);
        }
      })();
    });
    effect(() => {
      const ref = this.chatRef();
      const isGroupView = this.isGroupView();
      const selectedRoom = this.selectedRoom();
      const eventId = this.eventId();
      const contextMenuName = this.contextMenuName();
      if (!ref) return;
      ref.setInput('isGroupView', isGroupView);
      ref.setInput('selectedRoom', selectedRoom);
      ref.setInput('eventId', eventId);
      ref.setInput('contextMenuName', contextMenuName);
    });
    this.destroyRef.onDestroy(() => {
      this.destroyed = true;
      const ref = this.chatRef();
      if (ref && !ref.hostView.destroyed) ref.destroy();
    });
  }

  public async openInfo(): Promise<void> {
    await this.chatRef()?.instance.openChatHelp();
  }

  public async onContextMenuDismiss($event: CustomEvent): Promise<void> {
    await this.chatRef()?.instance.onPopoverDismiss($event);
  }
}

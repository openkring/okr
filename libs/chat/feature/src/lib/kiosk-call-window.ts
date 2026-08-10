import { Component, ElementRef, computed, effect, inject, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { IonButton, IonIcon } from '@ionic/angular/standalone';

import { MatrixCallService } from '@okr/chat-data-access';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { SvgIconPipe } from '@okr/shared-pipes';
import { hasRole } from '@okr/shared-util-core';

/**
 * Floating video window for an unattended kiosk device.
 *
 * Mounted once into document.body by MatrixInitializationService (kiosk-only users), so it
 * survives navigation and floats above whatever page is open — the Logbuch stays visible and
 * fully operable while the call runs. It renders nothing until a call is active.
 *
 * There is deliberately no close button for a kiosk user: the call ends when the admin who
 * placed it hangs up, which clears the call state and unmounts the window. A hangup control
 * appears only for an admin logged in at the device itself.
 */
@Component({
  selector: 'okr-kiosk-call-window',
  standalone: true,
  imports: [SvgIconPipe, IonButton, IonIcon],
  styles: [`
    .window {
      position: fixed;
      /* bottom-LEFT on purpose: the kiosk "new trip" FAB and the toolbar buttons
         both live on the right, so this corner is the one that stays free */
      left: 16px;
      bottom: 16px;
      /* above Ionic overlays (modals ~20000) so an open trip-edit modal cannot bury the call */
      z-index: 30000;
      width: 280px;
      border-radius: 8px;
      overflow: hidden;
      background: #000;
      box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.4), 0 4px 6px -4px rgb(0 0 0 / 0.4);
    }
    @media (width >= 768px) { .window { width: 360px; } }

    .bar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      background: var(--ion-color-danger, #c5000f);
      color: var(--ion-color-danger-contrast, #fff);
      font-size: 0.85rem;
    }
    .dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: currentColor;
      animation: pulse 1.6s ease-in-out infinite;
      flex: none;
    }
    @keyframes pulse { 50% { opacity: 0.25; } }
    @media (prefers-reduced-motion: reduce) { .dot { animation: none; } }
    .caller { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    .remote { display: block; width: 100%; aspect-ratio: 4 / 3; object-fit: cover; background: #000; }
    .local {
      position: absolute;
      right: 8px;
      bottom: 8px;
      width: 30%;
      border: 1px solid rgb(255 255 255 / 0.6);
      border-radius: 4px;
      background: #000;
    }
  `],
  template: `
    @if (isVisible()) {
      <div class="window" role="dialog" [attr.aria-label]="i18n.video_call()">
        <div class="bar">
          <span class="dot"></span>
          <span class="caller">{{ callerName() }}</span>
          @if (canHangup()) {
            <ion-button fill="clear" size="small" color="light" [attr.aria-label]="i18n.call_hangup()" (click)="hangup()">
              <ion-icon slot="icon-only" src="{{ 'cancel' | svgIcon }}" />
            </ion-button>
          }
        </div>
        <video #remoteVideo autoplay playsinline class="remote"></video>
        <video #localVideo autoplay playsinline muted class="local"></video>
      </div>
    }
  `,
})
export class KioskCallWindow {
  private readonly callService = inject(MatrixCallService);
  private readonly appStore = inject(AppStore);
  protected readonly i18n = inject(I18nService).translateAll({
    video_call: '@chat/feature.videoCall',
    video_connecting: '@chat/feature.video.connecting',
    call_hangup: '@chat/feature.call.hangup',
  });

  // view children
  private readonly remoteVideoRef = viewChild<ElementRef<HTMLVideoElement>>('remoteVideo');
  private readonly localVideoRef = viewChild<ElementRef<HTMLVideoElement>>('localVideo');

  // call state
  private readonly activeCall = toSignal(this.callService.activeCall);
  private readonly callState = toSignal(this.callService.callState);
  private readonly callFeeds = toSignal(this.callService.callFeeds, { initialValue: [] });

  protected readonly isVisible = computed(() => !!this.activeCall() && this.callState() !== 'ended');
  /**
   * You may end a call you started (the "Support anrufen" case), and an admin standing at the
   * device may end any call. A kiosk user cannot dismiss an incoming admin call — that one ends
   * when the admin who placed it hangs up.
   */
  protected readonly canHangup = computed(() =>
    // CallDirection is not re-exported from the package root; its Outbound member is 'outbound'
    String(this.activeCall()?.direction) === 'outbound' || hasRole('admin', this.appStore.currentUser())
  );
  protected readonly callerName = computed(() => {
    const opponent = this.activeCall()?.getOpponentMember();
    const name = opponent?.name ?? opponent?.userId ?? '';
    return this.callState() === 'connected' ? name : `${name} · ${this.i18n.video_connecting()}`;
  });

  constructor() {
    // Attach the MediaStreams whenever the feeds (or the <video> elements) change.
    effect(() => {
      const feeds = this.callFeeds();
      const remoteEl = this.remoteVideoRef()?.nativeElement;
      const localEl = this.localVideoRef()?.nativeElement;
      const localFeed = feeds.find(f => f.isLocal);
      const remoteFeed = feeds.find(f => !f.isLocal);
      if (localEl && localFeed?.stream) localEl.srcObject = localFeed.stream;
      if (remoteEl && remoteFeed?.stream) remoteEl.srcObject = remoteFeed.stream;
    });
  }

  protected hangup(): void {
    this.callService.hangupCall();
  }
}

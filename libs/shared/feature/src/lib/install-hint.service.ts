import { Injectable, Signal, effect, inject, untracked } from '@angular/core';
import { ToastController } from '@ionic/angular';
import { firstValueFrom } from 'rxjs';

import { I18nService } from '@okr/shared-i18n';
import { UserModel } from '@okr/shared-models';
import { getCurrentInstallGuideSection, isNativePlatform, isRunningInstalled } from '@okr/shared-util-angular';
import { getInstallHint, installGuideUrl, InstallHintKind, isKioskOnly } from '@okr/shared-util-core';

const PFX = '@shared/feature.';

/** localStorage key: the member closed the hint in this browser (a per-viewer convenience). */
const DISMISSED_KEY = 'okr.installHint.dismissed';

/** How long after sign-in the hint waits, so it does not crowd the start screen. */
const HINT_DELAY_MS = 8_000;

/** Chromium's install offer. Not in the DOM typings. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Suggests installing the app, in a browser tab only (spec 1.99 A2).
 *
 * Shown once per browser to a signed-in member, as a toast: «Installieren» where the browser offers
 * a one-click install (`beforeinstallprompt`, Chromium), otherwise a link to the section of the
 * install guide that fits the device. Never in an installed or native app, never to the kiosk.
 * Which hint, if any, is decided by `getInstallHint` (@okr/shared-util-core).
 * Started once from AppStore's onInit (browser only), which is also the injection context the
 * effect below needs.
 */
@Injectable({ providedIn: 'root' })
export class InstallHintService {
  private readonly toastController = inject(ToastController);
  private readonly i18nService = inject(I18nService);
  private installEvent: BeforeInstallPromptEvent | undefined;
  private started = false;
  private signedIn = false;
  private shown = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private currentUser: Signal<UserModel | undefined> | undefined;

  public start(currentUser: Signal<UserModel | undefined>): void {
    if (this.started || typeof window === 'undefined' || isNativePlatform()) return;
    this.started = true;
    this.currentUser = currentUser;

    // The event can fire before anyone signs in, so it is caught from the start. preventDefault()
    // keeps Chrome's own mini-infobar away; the hint offers the same install.
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      this.installEvent = event as BeforeInstallPromptEvent;
      if (this.signedIn && !this.timer) this.schedule(0);
    });
    window.addEventListener('appinstalled', () => this.markDismissed());

    effect(() => {
      const user = currentUser();
      untracked(() => {
        this.signedIn = !!user;
        if (user) this.schedule(HINT_DELAY_MS);
        else if (this.timer) { clearTimeout(this.timer); this.timer = undefined; }
      });
    });
  }

  private schedule(delayMs: number): void {
    if (this.shown || this.timer) return;
    this.timer = setTimeout(() => { this.timer = undefined; void this.showIfDue(); }, delayMs);
  }

  private hintKind(): InstallHintKind {
    return getInstallHint({
      section: getCurrentInstallGuideSection(),
      canPrompt: !!this.installEvent,
      isInstalled: isRunningInstalled(),
      isNative: isNativePlatform(),
      isKiosk: isKioskOnly(this.currentUser?.()),
      dismissed: this.isDismissed(),
    });
  }

  private async showIfDue(): Promise<void> {
    if (this.shown || !this.signedIn) return;
    const kind = this.hintKind();
    if (kind === 'none') return;
    const section = getCurrentInstallGuideSection();
    const messageKey = kind === 'install' ? 'install.messageInstall' : section === 'ios' ? 'install.messageIos' : section === 'other-browser' ? 'install.messageOtherBrowser' : 'install.messageGuide';
    const actionKey = kind === 'install' ? 'install.install' : 'install.guide';
    const [message, action, close] = await Promise.all(
      [messageKey, actionKey, 'install.close'].map((key) => firstValueFrom(this.i18nService.translate(PFX + key))),
    );
    if (this.shown || !message || message.startsWith(PFX)) return;   // text missing: try on the next start
    this.shown = true;
    const toast = await this.toastController.create({
      message,
      position: 'bottom',
      color: 'secondary',
      swipeGesture: 'vertical',
      buttons: [
        { text: action, role: 'confirm', handler: () => { void this.act(kind, section); } },
        { text: close, role: 'cancel' },
      ],
    });
    void toast.onDidDismiss().then(() => this.markDismissed());
    await toast.present();
  }

  /** «Installieren» runs the browser's own install dialog; «So geht's» opens the guide in a new tab. */
  private async act(kind: InstallHintKind, section: ReturnType<typeof getCurrentInstallGuideSection>): Promise<void> {
    if (kind === 'install' && this.installEvent) {
      const event = this.installEvent;
      this.installEvent = undefined;   // a prompt can be shown only once
      await event.prompt().catch(() => undefined);
      return;
    }
    window.open(installGuideUrl(section), '_blank', 'noopener');
  }

  private isDismissed(): boolean {
    try { return localStorage.getItem(DISMISSED_KEY) !== null; } catch { return false; }
  }

  private markDismissed(): void {
    try { localStorage.setItem(DISMISSED_KEY, new Date().toISOString()); } catch { /* storage blocked: the hint may come back */ }
  }
}

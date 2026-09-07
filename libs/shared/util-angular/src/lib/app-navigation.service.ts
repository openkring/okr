import { Injectable, inject } from "@angular/core";
import { Router } from "@angular/router";
import { ModalController } from "@ionic/angular/standalone";

import { getDeepLinkPath } from "@okr/shared-util-core";

import { dismissOverlay } from "./overlay.util";
 
@Injectable({ 
  providedIn: "root" 
})
export class AppNavigationService {
  private readonly modalController = inject(ModalController);
  private readonly router = inject(Router);
  private history: string[] = [];

  public dismissModal(): void {
    void dismissOverlay(this.modalController, null, 'cancel');
  }
 
  // only suited for pages.
  // for modals, use dismissModal() instead.
  public back(): void {
    this.popLink();
    if (this.history.length > 0) {
      this.router.navigateByUrl(this.history[this.history.length - 1]);
    } else {
      this.router.navigateByUrl('/');
    }
  }

  /**
   * Enter the app at the route carried by a deep link (Universal Link on iOS,
   * App Link on Android, or the custom scheme).
   *
   * The URL is reduced to a relative in-app path first, so a link from a foreign
   * origin can only ever select a route — never send the app somewhere else. An
   * unusable or excluded link is ignored and the app stays where it is.
   *
   * Any open modal is dismissed first: a deep link arriving while the user has an
   * editor open would otherwise navigate the page underneath the overlay, leaving
   * a modal that belongs to a screen that is no longer there.
   *
   * @param rawUrl the URL handed over by the OS (Capacitor `appUrlOpen` /
   *        `App.getLaunchUrl()`)
   * @returns `true` when a navigation was started
   */
  public async navigateToDeepLink(rawUrl: string | undefined | null): Promise<boolean> {
    const path = getDeepLinkPath(rawUrl);
    if (!path) return false;

    await dismissOverlay(this.modalController, null, 'cancel');
    this.resetLinkHistory(path);
    return this.router.navigateByUrl(path);
  }

  public pushLink(url: string): void {
    this.history.push(url);
  }

  private popLink(): void {
    this.history.pop();
  }

  public resetLinkHistory(url?: string): void {
    this.history = [];
    if (url) this.history.push(url);
  }

  public getLinkHistory(): string[] { 
    return this.history;
  }

  public logLinkHistory(): void {
    console.log('Link history:', this.history);
  }
}
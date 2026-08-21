import { Component } from '@angular/core';
import { IonButton } from '@ionic/angular/standalone';

import { forceBootRecovery, recoverFromBootFailure, reportBootFailure } from '@okr/shared-util-angular';

/**
 * The screen shown when the app shell itself could not be loaded — the `@error` branch of the
 * root `@defer` in every app's `okr-root`.
 *
 * Before this component the branch was a bare `<span>` reading "Bitte nochmals probieren" with
 * nothing to press, and Angular's internal handling of the deferred import's rejection meant the
 * failure reached neither `ChunkLoadErrorHandler` nor Sentry — a user reported a dead boot screen
 * for which no issue existed (SCS-7N). This component closes both gaps: it reports the failure,
 * retries once by itself, and then hands the user a working retry.
 *
 * **Deliberately not translated.** Reaching this screen means the app shell never loaded, so
 * Transloco, the i18n bundles and the store i18n pattern are all unavailable. German only, inline.
 *
 * Lives in `shared-ui` (not in an app) so all five apps and the app generator share one copy, and
 * uses only `IonButton`, which `okr-root` already pulls into the eager bundle — nothing here may
 * depend on a lazily-loaded chunk.
 */
@Component({
  selector: 'okr-boot-error',
  standalone: true,
  imports: [IonButton],
  styles: [`
    :host {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      min-height: 100vh;
      padding: 24px;
      text-align: center;
    }
    .boot-error {
      max-width: 32rem;
    }
    .hint {
      font-size: 0.875rem;
      opacity: 0.75;
    }
  `],
  template: `
    <div class="boot-error">
      <p>Oops ! Die Applikation konnte nicht geladen werden.</p>
      <p class="hint">
        Bitte pr&uuml;fen Sie Ihre Internetverbindung. Falls das Problem bestehen bleibt, erlauben
        Sie in den Browser-Einstellungen Cookies und Website-Daten f&uuml;r diese Seite &mdash; die
        App kann ohne lokalen Speicher nicht starten.
      </p>
      <ion-button (click)="retry()">Nochmals versuchen</ion-button>
    </div>
  `,
})
export class BootError {
  constructor() {
    void this.reportAndRecover();
  }

  /**
   * Report first, then retry once. The report is awaited so the in-flight event survives the
   * reload; `recoverFromBootFailure` is rate-limited, so on the second failure in a row nothing
   * happens here and the screen simply stays up with its button.
   */
  private async reportAndRecover(): Promise<void> {
    await reportBootFailure({
      url: typeof location === 'undefined' ? undefined : location.href,
      online: typeof navigator === 'undefined' ? undefined : navigator.onLine,
    });
    recoverFromBootFailure();
  }

  /** User-initiated retry: drop the service worker and its caches, then reload. */
  protected retry(): void {
    void forceBootRecovery();
  }
}

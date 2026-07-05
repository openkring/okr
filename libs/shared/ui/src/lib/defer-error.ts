import { Component, input } from '@angular/core';
import { IonButton, IonItem, IonLabel } from '@ionic/angular/standalone';

/**
 * Fallback content for `@defer` `@error` blocks (NG0750): shown when a lazy
 * chunk fails to load — typically because a new deployment replaced the hashed
 * chunk files while this client still runs the old version. Reloading fetches
 * the current deployment and resolves the situation.
 *
 * The default message is intentionally hardcoded German (same as the root
 * `@error` block in okr-root): when chunk loading is broken, i18n resources
 * may not be loadable either, so this component must not depend on them.
 *
 * Usage:
 *   @defer (on idle) { ... } @placeholder { <okr-spinner /> } @error { <okr-defer-error /> }
 */
@Component({
  selector: 'okr-defer-error',
  standalone: true,
  imports: [IonButton, IonItem, IonLabel],
  template: `
    <ion-item lines="none" color="warning">
      <ion-label class="ion-text-wrap">{{ message() }}</ion-label>
      <ion-button slot="end" fill="outline" color="dark" (click)="reload()">Neu laden</ion-button>
    </ion-item>
  `
})
export class DeferError {
  /** The user-facing message; override only with an already-translated string. */
  public message = input('Dieser Inhalt konnte nicht geladen werden. Vermutlich ist eine neue Version der App verfügbar.');

  protected reload(): void {
    window.location.reload();
  }
}

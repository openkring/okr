import { Component, inject, input } from '@angular/core';
import { AlertController, IonAccordion, IonButton, IonCol, IonGrid, IonItem, IonLabel, IonNote, IonRow } from '@ionic/angular/standalone';

import { forceBootRecovery, VersionCheckService } from '@okr/shared-util-angular';
import { ProfileI18n } from '@okr/profile-util';

/**
 * The user-driven way out of a client pinned to a stale build.
 *
 * Everything else that recovers from a stale build is automatic and needs a FAILURE to fire:
 * `recoverFromStaleChunk` needs a lazy chunk to actually fail, `VersionCheckService` needs the
 * service worker to have successfully downloaded the new build first, and the boot-error screen
 * needs the app shell not to render at all. A client whose app boots and works while running a
 * months-old bundle trips none of them — which is how devices ended up reporting `scs@7.15.0`
 * through `scs@7.29.0` weeks after those releases were replaced.
 *
 * `forceBootRecovery()` is what a support call would otherwise have to talk the member through by
 * hand in the browser settings: unregister the service worker, drop its caches, reload. It does
 * NOT touch localStorage or IndexedDB, so the Firebase Auth session survives and the user stays
 * signed in — which is why the confirmation may promise exactly that.
 *
 * Deliberately a component and not a `menuItems` row: menus are DB-driven, so a new row would
 * appear on a stale client whose bundle has no handler for it — an inert button with a raw i18n
 * key for a label, on the very device the feature exists to rescue.
 */
@Component({
  selector: 'okr-maintenance-accordion',
  standalone: true,
  imports: [IonAccordion, IonItem, IonLabel, IonGrid, IonRow, IonCol, IonNote, IonButton],
  template: `
  <ion-accordion toggle-icon-slot="start" value="maintenance">
    <ion-item slot="header" [color]="color()">
      <ion-label>{{ i18n().maint_title() }}</ion-label>
    </ion-item>
    <div slot="content">
      <ion-grid>
        <ion-row>
          <ion-col>
            <ion-item lines="none">
              <ion-label class="ion-text-wrap">{{ i18n().maint_description() }}</ion-label>
            </ion-item>
          </ion-col>
        </ion-row>
        <ion-row>
          <ion-col>
            <ion-item lines="none">
              <ion-label>{{ i18n().maint_version() }}</ion-label>
              <ion-note slot="end">{{ currentVersion }}</ion-note>
            </ion-item>
          </ion-col>
        </ion-row>
        <ion-row>
          <ion-col>
            <ion-button expand="block" color="medium" (click)="confirmReset()">{{ i18n().maint_reset() }}</ion-button>
          </ion-col>
        </ion-row>
      </ion-grid>
    </div>
  </ion-accordion>
  `,
})
export class MaintenanceAccordion {
  private readonly alertController = inject(AlertController);

  // inputs
  public readonly i18n = input.required<ProfileI18n>();
  public readonly color = input('primary');

  /**
   * Read once, not as a signal: this is the version of the bundle currently executing, which
   * cannot change while the page is open. Showing it here is half the point of the panel — it is
   * what a support call asks for first, and comparing it against the release notes row is how a
   * member finds out they are stale in the first place.
   */
  protected readonly currentVersion = inject(VersionCheckService).getCurrentVersion();

  /**
   * Confirm before tearing down. The reload costs a full cold start on a phone connection, so it
   * must not be one stray tap away — but the confirmation says what actually happens rather than
   * warning, because nothing is lost.
   */
  protected async confirmReset(): Promise<void> {
    const i18n = this.i18n();
    const alert = await this.alertController.create({
      header: i18n.maint_confirm_header(),
      message: i18n.maint_confirm_message(),
      buttons: [
        { text: i18n.cancel(), role: 'cancel' },
        { text: i18n.maint_reset(), role: 'confirm', handler: () => { void forceBootRecovery(); } },
      ],
    });
    await alert.present();
  }
}

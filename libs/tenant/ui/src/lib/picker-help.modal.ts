import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { IonContent, IonItem, IonLabel, IonList, ModalController } from '@ionic/angular/standalone';

import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import type { FeaturePickerI18n } from '@okr/tenant-util';

/**
 * The (i) icon in `/tenant/features`'s toolbar, reachable from BOTH segments — the one place
 * that spells out the idea the whole screen exists to express: *the catalogue proposes, the
 * tenant decides*. Four fixed sections, each its own i18n key so Task 12 can translate them
 * as ordinary prose rather than a bag of fragments:
 *
 *  1. What a Baustein (segment 1) is, versus a Menüzeile (segment 2, this table).
 *  2. The three exits off a drifted row and the test that tells «Fixieren» apart from
 *     «Katalog anpassen»: would you want the other tenants to get this value too?
 *  3. What «fixiert» means for a field going forward.
 *  4. The promise: nothing is deleted here, and no existing row changes without consent.
 *
 * Purely informational — read-only, no writing action lives in this modal.
 */
@Component({
  selector: 'okr-picker-help-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonContent, IonItem, IonLabel, IonList, ChangeConfirmation, Header],
  template: `
    <okr-header [i18n]="{ title: i18n().help_title() }" [isModal]="true" />
    <okr-change-confirmation
      [i18n]="changeConfirmationI18n()" [showCancel]="false" (saveClicked)="close()" />
    <ion-content>
      <ion-list>
        <ion-item lines="none">
          <ion-label class="ion-text-wrap">{{ i18n().help_blocks_vs_rows() }}</ion-label>
        </ion-item>
        <ion-item lines="none">
          <ion-label class="ion-text-wrap">{{ i18n().help_actions() }}</ion-label>
        </ion-item>
        <ion-item lines="none">
          <ion-label class="ion-text-wrap">{{ i18n().help_pinned() }}</ion-label>
        </ion-item>
        <ion-item lines="none">
          <ion-label class="ion-text-wrap">{{ i18n().help_promise() }}</ion-label>
        </ion-item>
      </ion-list>
    </ion-content>
  `,
})
export class PickerHelpModal {
  private readonly modalController = inject(ModalController);

  public i18n = input.required<FeaturePickerI18n>();

  protected readonly changeConfirmationI18n = computed<ChangeConfirmationI18n>(() => ({
    cancel: '', save: this.i18n().help_close(),
  }));

  protected async close(): Promise<void> {
    await dismissOverlay(this.modalController, undefined, 'cancel');
  }
}

import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IonContent, IonItem, IonLabel, IonList } from '@ionic/angular/standalone';

import { Header } from '@okr/shared-ui';
import type { FeaturePickerI18n } from '@okr/tenant-util';

/**
 * The (i) icon in `/tenant/features`'s toolbar, reachable from BOTH segments — the one place
 * that spells out the idea the whole screen exists to express: *the catalogue proposes, the
 * tenant decides*. Six fixed sections, each its own i18n key so Task 12 can translate them
 * as ordinary prose rather than a bag of fragments:
 *
 *  1. What a Baustein (segment 1) is, versus a Menüzeile (segment 2, this table).
 *  2. The three exits off a drifted row and the test that tells «Fixieren» apart from
 *     «Katalog anpassen»: would you want the other tenants to get this value too?
 *  3. The first-setup path: a profile only highlights; «Einschalten» / «Menü ergänzen» per
 *     block is what writes, and single rows are fetched on segment 2.
 *  4. Why there is no Save button: every action writes immediately, after its own confirmation.
 *  5. What «fixiert» means for a field going forward.
 *  6. The promise: nothing is deleted here, and no existing row changes without consent.
 *
 * Purely informational — read-only, no writing action lives in this modal. It is not a form, so
 * it carries no `okr-change-confirmation`; the header's own cancel button closes it.
 */
@Component({
  selector: 'okr-picker-help-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonContent, IonItem, IonLabel, IonList, Header],
  template: `
    <okr-header [i18n]="{ title: i18n().help_title() }" [isModal]="true" />
    <ion-content>
      <ion-list>
        <ion-item lines="none">
          <ion-label class="ion-text-wrap">{{ i18n().help_blocks_vs_rows() }}</ion-label>
        </ion-item>
        <ion-item lines="none">
          <ion-label class="ion-text-wrap">{{ i18n().help_actions() }}</ion-label>
        </ion-item>
        <ion-item lines="none">
          <ion-label class="ion-text-wrap">{{ i18n().help_setup() }}</ion-label>
        </ion-item>
        <ion-item lines="none">
          <ion-label class="ion-text-wrap">{{ i18n().help_saving() }}</ion-label>
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
  public i18n = input.required<FeaturePickerI18n>();
}

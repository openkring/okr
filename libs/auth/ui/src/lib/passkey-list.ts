import { Component, input, output } from '@angular/core';
import { IonChip, IonItem, IonLabel, IonList } from '@ionic/angular';

import { PasskeyItem } from '@okr/shared-models';
import { prettyFormatDateTime } from '@okr/shared-util-core';
import { AuthI18n } from '@okr/auth-util';

/**
 * Embedded list of a person's passkeys (dumb). Tapping a row emits `selected`; the parent opens
 * the action sheet. Stored times are rendered as-is.
 */
@Component({
  selector: 'okr-passkey-list',
  standalone: true,
  imports: [IonList, IonItem, IonLabel, IonChip],
  template: `
    @if (items().length === 0) {
      <ion-item lines="none">
        <ion-label class="ion-text-wrap">{{ i18n().passkey_empty() }}</ion-label>
      </ion-item>
    } @else {
      <ion-list lines="inset">
        @for (item of items(); track item.okey) {
          <ion-item button [detail]="false" (click)="selected.emit(item)">
            <ion-label class="ion-text-wrap">
              <h2>{{ item.label }}</h2>
              <p>{{ i18n().passkey_created() }}: {{ format(item.createdAt) }}</p>
              <p>{{ i18n().passkey_lastUsed() }}: {{ item.lastUsedAt ? format(item.lastUsedAt) : i18n().passkey_never() }}</p>
            </ion-label>
            @if (item.backedUp) {
              <ion-chip slot="end" color="medium">{{ i18n().passkey_synced() }}</ion-chip>
            }
          </ion-item>
        }
      </ion-list>
    }
  `,
})
export class PasskeyList {
  // inputs
  public readonly items = input.required<PasskeyItem[]>();
  public readonly i18n = input.required<AuthI18n>();

  // outputs
  public readonly selected = output<PasskeyItem>();

  protected format(value: string): string {
    return prettyFormatDateTime(value);
  }
}

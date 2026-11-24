import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonIcon, IonItem, IonLabel, IonList, IonNote, IonRow } from '@ionic/angular';

import { SvgIconPipe } from '@okr/shared-pipes';
import type { SettingsCard, SettingsGroupId, SettingsI18n } from '@okr/tenant-util';

/**
 * The settings of one app as cards, one per group, with their current values: `/tenant/settings` and `/operator/settings`.
 * A card of a group the user may edit has «Bearbeiten», which emits `edit`. Projected `ion-col`s follow as further cards.
 */
@Component({
  selector: 'okr-settings-cards',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    SvgIconPipe,
    IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonIcon, IonItem, IonLabel, IonList, IonNote, IonRow,
  ],
  styles: [`
    :host { display: block; }
    @media (width <= 600px) { ion-card { margin: 5px; } }
    ion-card-header { display: flex; flex-direction: row; align-items: center; justify-content: space-between; gap: 8px; }
    .label { font-size: 0.85rem; opacity: 0.7; }
    .value { display: flex; align-items: center; gap: 8px; }
    .value span.text {
      display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; line-clamp: 3; overflow: hidden;
      overflow-wrap: anywhere; white-space: pre-line;
    }
    .value.empty { opacity: 0.6; font-style: italic; }
    .swatch { flex: 0 0 auto; width: 20px; height: 20px; border-radius: 4px; border: 1px solid var(--ion-color-medium); }
  `],
  template: `
    <ion-grid>
      <ion-row>
        @for (card of cards(); track card.group) {
          <ion-col size="12" size-md="6">
            <ion-card>
              <ion-card-header>
                <ion-card-title>{{ card.title }}</ion-card-title>
                @if (card.canEdit) {
                  <ion-button fill="clear" size="small" [attr.aria-label]="text('edit') + ': ' + card.title" (click)="edit.emit(card.group)">
                    <ion-icon slot="start" src="{{ 'edit' | svgIcon }}" aria-hidden="true" />
                    {{ text('edit') }}
                  </ion-button>
                }
              </ion-card-header>
              <ion-card-content class="ion-no-padding">
                @if (card.note) {
                  <ion-item lines="none">
                    <ion-note class="ion-text-wrap">{{ card.note }}</ion-note>
                  </ion-item>
                }
                <ion-list lines="none">
                  @for (row of card.rows; track row.field) {
                    <ion-item>
                      <ion-label>
                        <div class="label ion-text-wrap">{{ row.label }}</div>
                        <div class="value" [class.empty]="!row.value">
                          @if (row.color) {
                            <span class="swatch" [style.background-color]="row.color"></span>
                          }
                          <span class="text">{{ row.value || text(row.emptyText) }}</span>
                        </div>
                      </ion-label>
                    </ion-item>
                  }
                </ion-list>
              </ion-card-content>
            </ion-card>
          </ion-col>
        }
        <ng-content />
      </ion-row>
    </ion-grid>
  `,
})
export class SettingsCards {
  public readonly cards = input.required<readonly SettingsCard[]>();
  public readonly i18n = input.required<SettingsI18n>();

  public readonly edit = output<SettingsGroupId>();

  protected text(name: string): string {
    return this.i18n()[name]?.() ?? '';
  }
}

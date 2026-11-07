// libs/content/pdf-template/ui/src/lib/versand-delivery-table.ts
import { Component, computed, input, output } from '@angular/core';
import { IonCheckbox, IonNote } from '@ionic/angular';

import { DeliveryChannel } from '@okr/shared-models';
import { MAILING_CHANNELS } from '@okr/shared-util-core';
import {
  ACTIVE_MAILING_CHANNELS, deliveryTotals, EmailComposerI18n, isDeliveryEditable,
  unreachableCount, VersandDeliveries, VersandRow,
} from '@okr/content-pdf-template-util';

/**
 * The Zustellung segment of a Versand (spec 1.144 §4.3): one row per recipient, one column per
 * delivery type, totals on top. A cell that is not possible for that person — or not sendable yet —
 * is disabled; every other cell can be ticked for this Versand only.
 */
@Component({
  selector: 'okr-versand-delivery-table',
  standalone: true,
  imports: [IonCheckbox, IonNote],
  styles: [`
    .scroll { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
    th, td { padding: 6px 8px; border-bottom: 1px solid var(--ion-color-light-shade); text-align: center; }
    th:first-child, td:first-child { text-align: left; }
    th { font-weight: 500; color: var(--ion-color-medium-shade); }
    th small { display: block; font-weight: 400; }
    tr.total td { font-weight: 500; }
    td small { display: block; color: var(--ion-color-medium); }
    .note { display: block; padding: 8px 12px; }
  `],
  template: `
    <ion-note class="note">{{ i18n().delivery_hint() }}</ion-note>
    <div class="scroll">
      <table>
        <thead>
          <tr>
            <th>{{ i18n().delivery_recipient() }}</th>
            @for (channel of channels; track channel) {
              <th>
                {{ label(channel) }}
                @if (!isActive(channel)) { <small>{{ i18n().delivery_soon() }}</small> }
              </th>
            }
          </tr>
        </thead>
        <tbody>
          <tr class="total">
            <td>{{ i18n().delivery_total() }}</td>
            @for (channel of channels; track channel) { <td>{{ totals()[channel] }}</td> }
          </tr>
          @for (row of rows(); track row.personKey) {
            <tr>
              <td>
                {{ row.name }}
                @if (row.email) { <small>{{ row.email }}</small> }
              </td>
              @for (channel of channels; track channel) {
                <td>
                  <ion-checkbox [checked]="isTicked(row, channel)" [disabled]="!isEditable(row, channel)"
                    [attr.aria-label]="row.name + ' ' + label(channel)"
                    (ionChange)="toggled.emit({ row, channel })" />
                </td>
              }
            </tr>
          }
        </tbody>
      </table>
    </div>
    @if (unreachable() > 0) {
      <ion-note class="note" color="warning">{{ i18n().delivery_unreachable() }} {{ unreachable() }}</ion-note>
    }
    @if (unreachable() === rows().length && rows().length > 0) {
      <ion-note class="note" color="danger">{{ i18n().delivery_empty() }}</ion-note>
    }
  `,
})
export class VersandDeliveryTable {
  // inputs
  public readonly rows = input.required<VersandRow[]>();
  public readonly deliveries = input.required<VersandDeliveries>();
  public readonly i18n = input.required<EmailComposerI18n>();

  // outputs
  public readonly toggled = output<{ row: VersandRow; channel: DeliveryChannel }>();

  protected readonly channels = MAILING_CHANNELS;
  protected readonly totals = computed(() => deliveryTotals(this.deliveries()));
  protected readonly unreachable = computed(() => unreachableCount(this.rows(), this.deliveries()));

  protected label(channel: DeliveryChannel): string {
    switch (channel) {
      case DeliveryChannel.Chat: return this.i18n().delivery_chat();
      case DeliveryChannel.Post: return this.i18n().delivery_post();
      default: return this.i18n().delivery_email();
    }
  }

  protected isActive(channel: DeliveryChannel): boolean {
    return ACTIVE_MAILING_CHANNELS.includes(channel);
  }

  protected isTicked(row: VersandRow, channel: DeliveryChannel): boolean {
    return (this.deliveries()[row.personKey] ?? []).includes(channel);
  }

  protected isEditable(row: VersandRow, channel: DeliveryChannel): boolean {
    return isDeliveryEditable(row, channel);
  }
}

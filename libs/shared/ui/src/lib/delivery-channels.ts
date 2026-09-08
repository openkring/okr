import { Component, computed, input, output } from '@angular/core';
import { IonCol, IonGrid, IonItem, IonLabel, IonNote, IonRow } from '@ionic/angular/standalone';

import { DeliveryChannels } from '@okr/shared-categories';
import { DeliveryChannel } from '@okr/shared-models';
import { coerceBoolean } from '@okr/shared-util-core';

import { Checkbox, CheckboxI18n } from './checkbox';

export interface DeliveryChannelsI18n {
  name: string;
  label: string;
  helper: string;
  /** label per channel name ('post' | 'email' | 'chat'); a missing entry falls back to the name */
  channels: Record<string, string>;
}

/**
 * The three delivery channels as a multiple choice.
 *
 * Clearing the last tick is deliberately NOT blocked here — otherwise the single selected
 * channel could never be swapped for another one. The empty list is a validation error in
 * the owning form (deliveryChannelsValidations), which is where the user sees it.
 */
@Component({
  selector: 'okr-delivery-channels',
  standalone: true,
  imports: [Checkbox, IonGrid, IonRow, IonCol, IonItem, IonLabel, IonNote],
  template: `
    <ion-item lines="none">
      <ion-label>{{ i18n().label }}</ion-label>
    </ion-item>
    <ion-grid class="ion-no-padding">
      <ion-row>
        @for (channel of channels; track channel.value) {
          <ion-col size="12" size-md="4">
            <okr-checkbox
              [checked]="isChecked(channel.value)"
              (checkedChange)="onToggle(channel.value, $event)"
              [i18n]="labelFor(channel.value, channel.name)"
              [iconName]="channel.icon"
              [readOnly]="isReadOnly()"
            />
          </ion-col>
        }
      </ion-row>
    </ion-grid>
    @if (i18n().helper.length > 0) {
      <ion-item lines="none">
        <ion-note>{{ i18n().helper }}</ion-note>
      </ion-item>
    }
  `,
})
export class DeliveryChannelsControl {
  // inputs
  public readonly i18n = input.required<DeliveryChannelsI18n>();
  public readonly value = input<DeliveryChannel[]>([]);
  public readonly readOnly = input<boolean>(true);
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // output
  public readonly valueChange = output<DeliveryChannel[]>();

  // passing constants to template
  protected readonly channels = DeliveryChannels;

  protected isChecked(channel: DeliveryChannel): boolean {
    return this.value().includes(channel);
  }

  protected labelFor(channel: DeliveryChannel, name: string): CheckboxI18n {
    return { name: `${this.i18n().name}-${name}`, label: this.i18n().channels[name] ?? name, helper: '' };
  }

  protected onToggle(channel: DeliveryChannel, checked: boolean): void {
    // rebuilt from the canonical list, so the emitted order never depends on click order
    const next = this.channels
      .map((entry) => entry.value)
      .filter((entry) => (entry === channel ? checked : this.value().includes(entry)));
    this.valueChange.emit(next);
  }
}

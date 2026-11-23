import { Component, computed, input, signal } from '@angular/core';
import { IonButton, IonCard, IonCardContent, IonCol, IonGrid, IonItem, IonNote, IonRow } from '@ionic/angular';

import { DeliveryChannel } from '@okr/shared-models';
import { DeliveryChannelsControl, ErrorNote, StringSelect } from '@okr/shared-ui';
import type { DeliveryChannelsI18n } from '@okr/shared-ui';
import { SETTINGS_DEFAULT_NUMBERS, withStored } from '@okr/tenant-util';
import type { SettingsChoice } from '@okr/tenant-util';

import { SettingsFormBase } from './settings-form.base';
import { SettingsPublicNote } from './settings-public-note';

type PickerField = 'ownerLocationId' | 'defaultResourceId';
type NumberField = keyof typeof SETTINGS_DEFAULT_NUMBERS;
type ChannelField = 'newsDelivery' | 'invoiceDelivery';

/**
 * Settings group «Vorgaben»: the location and the resource of the app, and what a new account starts with (picture,
 * names, sorting, how news and invoices reach the person). The two pickers belong to the parent (`onPickLocation`,
 * `onPickResource`), as the image upload does: this form only sets the id the parent answered; saving stays with the
 * change confirmation. The five account fields are copied onto a user when the account is opened: existing accounts keep
 * their own choice. An empty channel list is invalid (it cannot be saved), as in the user's own settings.
 */
@Component({
  selector: 'okr-settings-defaults-form',
  standalone: true,
  imports: [DeliveryChannelsControl, ErrorNote, SettingsPublicNote, StringSelect, IonButton, IonCard, IonCardContent, IonCol, IonGrid, IonItem, IonNote, IonRow],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px;} }
    .none { margin: 8px 16px; font-style: italic; opacity: 0.7; }
    .name { margin: 8px 16px; overflow-wrap: anywhere; }
    .buttons { margin: 0 8px; }
  `],
  template: `
    @if (showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <okr-settings-public-note [text]="publicNote()" />
            <ion-grid>
              <ion-row>
                @for (picker of pickers(); track picker.field) {
                  <ion-col size="12" size-md="6">
                    <div class="ion-padding-horizontal">{{ fields()[picker.field].label }}</div>
                    @if (picker.shown) {
                      <div class="name">{{ picker.shown }}</div>
                    } @else {
                      <div class="none">{{ text('empty') }}</div>
                    }
                    <div class="buttons">
                      <ion-button fill="outline" size="small" [disabled]="isBusy()" (click)="pick(picker.field)">
                        {{ picker.id ? text(picker.kind + '_change') : text(picker.kind + '_pick') }}
                      </ion-button>
                      @if (picker.id && !isReadOnly()) {
                        <ion-button fill="clear" size="small" [disabled]="isBusy()" (click)="onFieldChange(picker.field, '')">{{ text(picker.kind + '_remove') }}</ion-button>
                      }
                    </div>
                    <okr-error-note [errors]="errors()[picker.field]" />
                    @if (helperVisibility.showHelpers()) {
                      <ion-item lines="none" [button]="false">
                        <ion-note class="ion-text-wrap">{{ fields()[picker.field].helper }}</ion-note>
                      </ion-item>
                    }
                  </ion-col>
                }
                @for (select of selects(); track select.field) {
                  <ion-col size="12" size-md="6">
                    <okr-string-select [i18n]="fields()[select.field]" [selectedString]="select.value"
                      (selectedStringChange)="onNumberChange(select.field, $event)"
                      [stringList]="select.options" [labels]="select.labels" [readOnly]="isReadOnly()" />
                    <okr-error-note [errors]="errors()[select.field]" />
                  </ion-col>
                }
                @for (channel of channelFields(); track channel.field) {
                  <ion-col size="12" size-md="6">
                    <div role="group" [attr.aria-label]="fields()[channel.field].label">
                      <okr-delivery-channels [i18n]="channel.i18n" [value]="channel.value"
                        (valueChange)="onFieldChange(channel.field, $event)" [readOnly]="isReadOnly()" />
                    </div>
                    <okr-error-note [errors]="errors()[channel.field]" />
                  </ion-col>
                }
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>
      </form>
    }
  `,
})
export class SettingsDefaultsForm extends SettingsFormBase {
  /** Opens the location picker; answers the pick, undefined when cancelled (the value then stays). */
  public readonly onPickLocation = input.required<() => Promise<SettingsChoice | undefined>>();
  /** Opens the resource picker; answers the pick, undefined when cancelled. */
  public readonly onPickResource = input.required<() => Promise<SettingsChoice | undefined>>();
  /** The name of a stored id (field, id), '' when it cannot be told: the id then stays visible as it is. */
  public readonly nameOf = input<(field: string, id: string) => string>(() => '');

  protected readonly isBusy = computed(() => this.working() !== '' || this.isReadOnly());

  /** the names of the ids picked in this form, by id: the page may not know them yet */
  private readonly picked = signal<Record<string, string>>({});

  protected readonly pickers = computed(() => (['ownerLocationId', 'defaultResourceId'] as const).map((field: PickerField) => {
    const id = this.values()[field] ?? '';
    return { field, id, kind: field === 'ownerLocationId' ? 'location' : 'resource', shown: id ? (this.picked()[`${field}:${id}`] || this.nameOf()(field, id) || id) : '' };
  }));

  protected readonly selects = computed(() => (Object.keys(SETTINGS_DEFAULT_NUMBERS) as NumberField[]).map((field) => {
    const raw = (this.formData() as Record<string, unknown>)[field];
    const value = typeof raw === 'number' ? String(raw) : '';
    // a stored number the list does not offer stays the first choice, also after another one was picked
    const options = withStored(SETTINGS_DEFAULT_NUMBERS[field].map(String), typeof (this.context().before as Record<string, unknown>)[field] === 'number' ? String((this.context().before as Record<string, unknown>)[field]) : '');
    return { field, value, options, labels: options.map((option) => this.text(`${field}_${option}`)) };
  }));

  protected readonly channelFields = computed(() => (['newsDelivery', 'invoiceDelivery'] as const).map((field: ChannelField) => {
    const raw = (this.formData() as Record<string, unknown>)[field];
    return {
      field,
      value: (Array.isArray(raw) ? raw : []) as DeliveryChannel[],
      i18n: {
        name: field, label: this.fields()[field].label, helper: this.fields()[field].helper,
        channels: { post: this.text('channel_post'), email: this.text('channel_email'), chat: this.text('channel_chat') },
      } as DeliveryChannelsI18n,
    };
  }));

  protected get group(): 'defaults' { return 'defaults'; }

  protected async pick(field: PickerField): Promise<void> {
    const call = field === 'ownerLocationId' ? this.onPickLocation() : this.onPickResource();
    const choice = await this.runExclusive(field, call);
    if (!choice?.id) return; // cancelled, failed, reset or destroyed: the value stays
    this.picked.update((names) => ({ ...names, [`${field}:${choice.id}`]: choice.name }));
    this.onFieldChange(field, choice.id);
  }

  protected onNumberChange(field: NumberField, value: string): void {
    const number = Number(value);
    if (value !== '' && Number.isFinite(number) && number !== (this.formData() as Record<string, unknown>)[field]) this.onFieldChange(field, number);
  }
}

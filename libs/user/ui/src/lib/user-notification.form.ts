import { Component, computed, effect, input, linkedSignal, model, output } from "@angular/core";
import { IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCol, IonGrid, IonRow } from "@ionic/angular/standalone";

import { DeliveryChannel, UserModel } from "@okr/shared-models";
import { DeliveryChannelsControl, DeliveryChannelsI18n, ErrorNote } from "@okr/shared-ui";
import { coerceBoolean, toDeliveryChannels } from "@okr/shared-util-core";

import { USER_NOTIFICATION_FORM_SHAPE, UserI18n, UserNotificationFormModel, userNotificationFormValidations } from "@okr/user-util";

@Component({
  selector: 'okr-user-notification-form',
  standalone: true,
  imports: [
    DeliveryChannelsControl, ErrorNote,
    IonCard, IonCardHeader, IonCardContent, IonCardTitle, IonCardSubtitle,
    IonGrid, IonRow, IonCol
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    <form novalidate>
      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ i18n().notification_title() }}</ion-card-title>
          <ion-card-subtitle>{{ i18n().notification_description() }}</ion-card-subtitle>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
            <ion-col size="12" size-md="6">
              <okr-delivery-channels [i18n]="newsDeliveryI18n()" [value]="newsDelivery()" (valueChange)="onFieldChange('newsDelivery', $event)" [readOnly]="readOnly()" />
              <okr-error-note [errors]="newsDeliveryErrors()" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <okr-delivery-channels [i18n]="invoiceDeliveryI18n()" [value]="invoiceDelivery()" (valueChange)="onFieldChange('invoiceDelivery', $event)" [readOnly]="readOnly()" />
              <okr-error-note [errors]="invoiceDeliveryErrors()" />
            </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>
    </form>
  `
})
export class UserNotificationForm {
  protected channelLabels = computed(() => ({
    post:  this.i18n().deliveryChannel_post(),
    email: this.i18n().deliveryChannel_email(),
    chat:  this.i18n().deliveryChannel_chat(),
  }));
  protected newsDeliveryI18n = computed(() => ({
    name: 'newsDelivery', label: this.i18n().newsDelivery_label(), helper: '', channels: this.channelLabels(),
  } as DeliveryChannelsI18n));
  protected invoiceDeliveryI18n = computed(() => ({
    name: 'invoiceDelivery', label: this.i18n().invoiceDelivery_label(), helper: '', channels: this.channelLabels(),
  } as DeliveryChannelsI18n));

  public readonly i18n = input.required<UserI18n>();
  public formData = model.required<UserNotificationFormModel>();
  public currentUser = input<UserModel | undefined>();
  public readonly readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();

  // validation and errors
  protected readonly shape = USER_NOTIFICATION_FORM_SHAPE;
  private readonly validationResult = computed(() => userNotificationFormValidations(this.formData()));
  protected newsDeliveryErrors = computed(() => this.validationResult().getErrors('newsDelivery'));
  protected invoiceDeliveryErrors = computed(() => this.validationResult().getErrors('invoiceDelivery'));

  // computed fields
  // An already migrated list passes through UNCHANGED — an empty one included, because that is
  // the state the error notes above report; only a legacy value is converted.
  protected newsDelivery = linkedSignal(() => this.asChannels(this.formData().newsDelivery));
  protected invoiceDelivery = linkedSignal(() => this.asChannels(this.formData().invoiceDelivery));

  constructor() {
    effect(() => {
      this.valid.emit(this.validationResult().isValid());
    });
  }

  private asChannels(raw: unknown): DeliveryChannel[] {
    return Array.isArray(raw) ? (raw as DeliveryChannel[]) : toDeliveryChannels(raw);
  }

  protected onFieldChange(fieldName: string, fieldValue: DeliveryChannel[]): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }
}

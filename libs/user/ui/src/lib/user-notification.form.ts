import { Component, computed, effect, input, linkedSignal, model, output, Signal } from "@angular/core";
import { IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCol, IonGrid, IonRow } from "@ionic/angular/standalone";

import { DeliveryTypes } from "@bk2/shared-categories";
import { DeliveryType, UserModel } from "@bk2/shared-models";
import { CategoryOld, CategoryOldI18n } from "@bk2/shared-ui";
import { coerceBoolean } from "@bk2/shared-util-core";

import { USER_NOTIFICATION_FORM_SHAPE, UserI18n, UserNotificationFormModel, userNotificationFormValidations } from "@bk2/user-util";

@Component({
  selector: 'bk-user-notification-form',
  standalone: true,
  imports: [
    CategoryOld,
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
              <bk-category-old [i18n]="newsDeliveryI18n()" [value]="newsDelivery()" (valueChange)="onFieldChange('newsDelivery', $event)" [categories]="deliveryTypes" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-category-old [i18n]="invoiceDeliveryI18n()" [value]="invoiceDelivery()" (valueChange)="onFieldChange('invoiceDelivery', $event)" [categories]="deliveryTypes" [readOnly]="readOnly()" />
            </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>
    </form>
  `
})
export class UserNotificationForm {
  protected newsDeliveryI18n    = computed(() => ({ name: 'newsDelivery',    label: this.i18n().newsDelivery_label()    } as CategoryOldI18n));
  protected invoiceDeliveryI18n = computed(() => ({ name: 'invoiceDelivery', label: this.i18n().invoiceDelivery_label() } as CategoryOldI18n));

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

  // computed fields
  protected newsDelivery = linkedSignal(() => this.formData().newsDelivery ?? DeliveryType.EmailAttachment);
  protected invoiceDelivery = linkedSignal(() => this.formData().invoiceDelivery ?? DeliveryType.EmailAttachment);

  // passing constants to template
  protected readonly deliveryTypes = DeliveryTypes;

  constructor() {
    effect(() => {
      this.valid.emit(this.validationResult().isValid());
    });
  }

  protected onFieldChange(fieldName: string, fieldValue: DeliveryType): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }
}

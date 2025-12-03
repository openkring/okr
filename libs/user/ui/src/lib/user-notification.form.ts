import { AsyncPipe } from "@angular/common";
import { Component, computed, effect, input, model, output } from "@angular/core";
import { IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCol, IonGrid, IonRow } from "@ionic/angular/standalone";
import { vestForms, vestFormsViewProviders } from "ngx-vest-forms";

import { DeliveryTypes } from "@bk2/shared-categories";
import { TranslatePipe } from "@bk2/shared-i18n";
import { DeliveryType, UserModel } from "@bk2/shared-models";
import { CategoryComponent } from "@bk2/shared-ui";
import { coerceBoolean, debugFormErrors } from "@bk2/shared-util-core";

import { USER_NOTIFICATION_FORM_SHAPE, UserNotificationFormModel, userNotificationFormValidations } from "@bk2/user-util";

@Component({
  selector: 'bk-user-notification-form',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
    vestForms,
    CategoryComponent,
    IonCard, IonCardHeader, IonCardContent, IonCardTitle, IonCardSubtitle,
    IonGrid, IonRow, IonCol
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  viewProviders: [vestFormsViewProviders],
  template: `
    <form scVestForm
      [formShape]="shape"
      [formValue]="formData()"
      [suite]="suite" 
      (dirtyChange)="dirty.emit($event)"
      (formValueChange)="onFormChange($event)">
      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ '@user.notification.title' | translate | async }}</ion-card-title>
          <ion-card-subtitle>{{ '@user.notification.description' | translate | async }}</ion-card-subtitle>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
            <ion-col size="12" size-md="6">                                                             
              <bk-cat name="newsDelivery" [value]="newsDelivery()" [categories]="deliveryTypes" [readOnly]="readOnly()" (changed)="onFieldChange('newsDelivery', $event)" />
            </ion-col>
            <ion-col size="12" size-md="6">                                                             
              <bk-cat name="invoiceDelivery" [value]="invoiceDelivery()" [categories]="deliveryTypes" [readOnly]="readOnly()" (changed)="onFieldChange('invoiceDelivery', $event)" />
            </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>
    </form>
  `
})
export class UserNotificationFormComponent {
  public formData = model.required<UserNotificationFormModel>();
  public currentUser = input<UserModel | undefined>();
  public readonly readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();

  // validation and errors
  protected readonly suite = userNotificationFormValidations;
  protected readonly shape = USER_NOTIFICATION_FORM_SHAPE;
  private readonly validationResult = computed(() => userNotificationFormValidations(this.formData()));

  // computed fields
  protected newsDelivery = computed(() => this.formData().newsDelivery ?? DeliveryType.EmailAttachment);
  protected invoiceDelivery = computed(() => this.formData().invoiceDelivery ?? DeliveryType.EmailAttachment);

  // passing constants to template
  protected readonly deliveryTypes = DeliveryTypes;

  constructor() {
    effect(() => {
      this.valid.emit(this.validationResult().isValid());
    });
  }

  protected onFormChange(value: UserNotificationFormModel): void {
    this.formData.update((vm) => ({...vm, ...value}));
    debugFormErrors('UserNotificationForm.onFormChange', this.validationResult().errors, this.currentUser());
  }

  protected onFieldChange(fieldName: string, fieldValue: string | string[] | number | boolean): void {
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
    debugFormErrors('UserNotificationForm.onFieldChange', this.validationResult().errors, this.currentUser());
  }
}

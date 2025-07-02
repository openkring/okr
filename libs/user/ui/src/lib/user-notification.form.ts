import { AsyncPipe } from "@angular/common";
import { Component, computed, input, model, output, signal } from "@angular/core";
import { vestForms, vestFormsViewProviders } from "ngx-vest-forms";
import { IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCol, IonGrid, IonRow } from "@ionic/angular/standalone";

import { DeliveryTypes } from "@bk2/shared/categories";
import { DeliveryType, UserModel } from "@bk2/shared/models";
import { CategoryComponent } from "@bk2/shared/ui";
import { debugFormErrors } from "@bk2/shared/util-core";
import { TranslatePipe } from "@bk2/shared/i18n";

import { UserNotificationFormModel, userNotificationFormModelShape, userNotificationFormValidations } from "@bk2/user/util";

@Component({
  selector: 'bk-user-notification-form',
  imports: [
    TranslatePipe, AsyncPipe,
    vestForms,
    CategoryComponent,
    IonCard, IonCardHeader, IonCardContent, IonCardTitle, IonCardSubtitle,
    IonGrid, IonRow, IonCol
  ],
  viewProviders: [vestFormsViewProviders],
  template: `
    <form scVestForm
      [formShape]="shape"
      [formValue]="vm()"
      [suite]="suite" 
      (dirtyChange)="dirtyChange.set($event)"
      (formValueChange)="onValueChange($event)">
      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ '@user.notification.title' | translate | async }}</ion-card-title>
          <ion-card-subtitle>{{ '@user.notification.description' | translate | async }}</ion-card-subtitle>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
            <ion-col size="12" size-md="6">                                                             
              <bk-cat name="newsDelivery" [value]="newsDelivery()" [categories]="deliveryTypes" (changed)="onChange('newsDelivery', $event)" />
            </ion-col>
            <ion-col size="12" size-md="6">                                                             
              <bk-cat name="invoiceDelivery" [value]="invoiceDelivery()" [categories]="deliveryTypes" (changed)="onChange('invoiceDelivery', $event)" />
            </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>
    </form>
  `
})
export class UserNotificationFormComponent {
  public vm = model.required<UserNotificationFormModel>();
  public currentUser = input<UserModel | undefined>();

  protected newsDelivery = computed(() => this.vm().newsDelivery ?? DeliveryType.EmailAttachment);
  protected invoiceDelivery = computed(() => this.vm().invoiceDelivery ?? DeliveryType.EmailAttachment);

  protected readonly deliveryTypes = DeliveryTypes;

  public validChange = output<boolean>();
  protected dirtyChange = signal(false);
  private readonly validationResult = computed(() => userNotificationFormValidations(this.vm()));

  protected readonly suite = userNotificationFormValidations;
  protected readonly shape = userNotificationFormModelShape;

  protected onValueChange(value: UserNotificationFormModel): void {
    this.vm.update((_vm) => ({..._vm, ...value}));
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }

  protected onChange(fieldName: string, $event: string | string[] | number | boolean): void {
    this.vm.update((vm) => ({ ...vm, [fieldName]: $event }));
    debugFormErrors('UserNotificationForm', this.validationResult().errors, this.currentUser());
    this.dirtyChange.set(true); // it seems, that vest is not updating dirty by itself for this change
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }
}

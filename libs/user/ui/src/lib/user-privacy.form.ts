import { AsyncPipe } from "@angular/common";
import { Component, computed, input, model, output, signal } from "@angular/core";
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonRow } from "@ionic/angular/standalone";
import { vestForms, vestFormsViewProviders } from "ngx-vest-forms";

import { PrivacyUsages } from "@bk2/shared/categories";
import { TranslatePipe } from "@bk2/shared/i18n";
import { FieldDescription, PrivacyUsage, UserModel } from "@bk2/shared/models";
import { CategoryComponent } from "@bk2/shared/ui";
import { debugFormErrors } from "@bk2/shared/util";

import { UserPrivacyFormModel, userPrivacyFormModelShape, userPrivacyFormValidations } from "@bk2/user/util";

@Component({
  selector: 'bk-user-privacy',
  imports: [
    TranslatePipe, AsyncPipe,
    vestForms,
    CategoryComponent,
    IonCard, IonCardHeader, IonCardContent, IonCardTitle,
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
          <ion-card-title>{{ '@user.privacy.title' | translate | async }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
        {{ '@user.privacy.description' | translate | async }}
          <ion-grid>
            <ion-row>
              <ion-col size="12" size-md="6">                                                             
                <bk-cat name="usage_images" [value]="usage_images()" [categories]="privacyUsages" (changed)="onChange('usage_images', $event)" />
              </ion-col>
              <ion-col size="12" size-md="6">                                                             
                <bk-cat name="usage_dateOfBirth" [value]="usage_dateOfBirth()" [categories]="privacyUsages" (changed)="onChange('usage_dateOfBirth', $event)" />
              </ion-col>
              <ion-col size="12" size-md="6">                                                             
                <bk-cat name="usage_postalAddress" [value]="usage_postalAddress()" [categories]="privacyUsages" (changed)="onChange('usage_postalAddress', $event)" />
              </ion-col>
              <ion-col size="12" size-md="6">                                                             
                <bk-cat name="usage_email" [value]="usage_email()" [categories]="privacyUsages" (changed)="onChange('usage_email', $event)" />
              </ion-col>
              <ion-col size="12" size-md="6">                                                             
                <bk-cat name="usage_phone" [value]="usage_phone()" [categories]="privacyUsages" (changed)="onChange('usage_phone', $event)" />
              </ion-col>
              <ion-col size="12" size-md="6">                                                             
                <bk-cat name="usage_name" [value]="usage_name()" [categories]="privacyUsages" (changed)="onChange('usage_name', $event)" />
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>
    </form>
  `
})
export class UserPrivacyFormComponent {
  public vm = model.required<UserPrivacyFormModel>();
  public currentUser = input<UserModel | undefined>();

  protected privacyUsages = PrivacyUsages;
  public changedField = output<FieldDescription>();

  protected usage_images = computed(() => this.vm().usage_images ?? PrivacyUsage.Registered);
  protected usage_dateOfBirth = computed(() => this.vm().usage_dateOfBirth ?? PrivacyUsage.Registered);
  protected usage_postalAddress = computed(() => this.vm().usage_postalAddress ?? PrivacyUsage.Registered);
  protected usage_email = computed(() => this.vm().usage_email ?? PrivacyUsage.Registered);
  protected usage_phone = computed(() => this.vm().usage_phone ?? PrivacyUsage.Registered);
  protected usage_name = computed(() => this.vm().usage_name ?? PrivacyUsage.Registered);

  public validChange = output<boolean>();
  protected dirtyChange = signal(false);
  private readonly validationResult = computed(() => userPrivacyFormValidations(this.vm()));

  protected readonly suite = userPrivacyFormValidations;
  protected readonly shape = userPrivacyFormModelShape;

  protected onValueChange(value: UserPrivacyFormModel): void {
    this.vm.update((_vm) => ({..._vm, ...value}));
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }

  protected onChange(fieldName: string, $event: string | string[] | number | boolean): void {
    this.vm.update((vm) => ({ ...vm, [fieldName]: $event }));
    debugFormErrors('UserPrivacy', this.validationResult().errors, this.currentUser());
    this.dirtyChange.set(true); // it seems, that vest is not updating dirty by itself for this change
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }
}

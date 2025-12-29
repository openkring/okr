import { AsyncPipe } from "@angular/common";
import { Component, computed, input, linkedSignal, model, output } from "@angular/core";
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonItem, IonLabel, IonRow } from "@ionic/angular/standalone";
import { vestForms, vestFormsViewProviders } from "ngx-vest-forms";

import { PrivacyUsages } from "@bk2/shared-categories";
import { TranslatePipe } from "@bk2/shared-i18n";
import { PrivacyUsage, UserModel } from "@bk2/shared-models";
import { CategoryComponent, CheckboxComponent } from "@bk2/shared-ui";
import { coerceBoolean, debugFormErrors } from "@bk2/shared-util-core";

import { USER_PRIVACY_FORM_SHAPE, UserPrivacyFormModel, userPrivacyFormValidations } from "@bk2/user-util";

@Component({
  selector: 'bk-user-privacy-form',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
    vestForms,
    CategoryComponent, CheckboxComponent,
    IonCard, IonCardHeader, IonCardContent, IonCardTitle,
    IonGrid, IonRow, IonCol, IonItem, IonLabel
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
          <ion-card-title>{{ '@user.privacy.title' | translate | async }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
        {{ '@user.privacy.description' | translate | async }}
          <ion-grid>
            <ion-row>
              <ion-col size="12" size-md="6">                                                             
                <bk-cat name="usageImages" [value]="usageImages()" (valueChange)="onFieldChange('usageImages', $event)" [categories]="privacyUsages" [readOnly]="readOnly()" />
              </ion-col>
              <ion-col size="12" size-md="6">                                                             
                <bk-cat name="usageDateOfBirth" [value]="usageDateOfBirth()" (valueChange)="onFieldChange('usageDateOfBirth', $event)" [categories]="privacyUsages" [readOnly]="readOnly()" />
              </ion-col>
              <ion-col size="12" size-md="6">                                                             
                <bk-cat name="usagePostalAddress" [value]="usagePostalAddress()" (valueChange)="onFieldChange('usagePostalAddress', $event)" [categories]="privacyUsages" [readOnly]="readOnly()" />
              </ion-col>
              <ion-col size="12" size-md="6">                                                             
                <bk-cat name="usageEmail" [value]="usageEmail()" (valueChange)="onFieldChange('usageEmail', $event)" [categories]="privacyUsages" [readOnly]="readOnly()" />
              </ion-col>
              <ion-col size="12" size-md="6">                                                             
                <bk-cat name="usagePhone" [value]="usagePhone()" (valueChange)="onFieldChange('usagePhone', $event)" [categories]="privacyUsages" [readOnly]="readOnly()" />
              </ion-col>
              <ion-col size="12" size-md="6">                                                             
                <bk-cat name="usageName" [value]="usageName()" (valueChange)="onFieldChange('usageName', $event)" [categories]="privacyUsages" [readOnly]="readOnly()" />
              </ion-col>
            </ion-row>
            @if(isScs()) {
              <ion-row>
                <ion-col>
                  <ion-item lines="none">
                    <ion-label>{{ '@auth.privacyUsage.srv.description' | translate | async }}</ion-label>
                  </ion-item>
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col>
                  <bk-checkbox name="srvEmail" [checked]="srvEmail()" (checkedChange)="onFieldChange('srvEmail', $event)" [showHelper]="true" [readOnly]="readOnly()" />
                </ion-col>
              </ion-row>
            }
          </ion-grid>
        </ion-card-content>
      </ion-card>
    </form>
  `
})
export class UserPrivacyFormComponent {
  // inputs
  public formData = model.required<UserPrivacyFormModel>();
  public currentUser = input<UserModel | undefined>();
  public readonly readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();

  // validation and errors
  protected readonly suite = userPrivacyFormValidations;
  protected readonly shape = USER_PRIVACY_FORM_SHAPE;
  private readonly validationResult = computed(() => userPrivacyFormValidations(this.formData()));

  // fields
  protected usageImages = linkedSignal(() => this.formData().usageImages ?? PrivacyUsage.Restricted);
  protected usageDateOfBirth = linkedSignal(() => this.formData().usageDateOfBirth ?? PrivacyUsage.Restricted);
  protected usagePostalAddress = linkedSignal(() => this.formData().usagePostalAddress ?? PrivacyUsage.Restricted);
  protected usageEmail = linkedSignal(() => this.formData().usageEmail ?? PrivacyUsage.Restricted);
  protected usagePhone = linkedSignal(() => this.formData().usagePhone ?? PrivacyUsage.Restricted);
  protected usageName = linkedSignal(() => this.formData().usageName ?? PrivacyUsage.Restricted);
  protected srvEmail = linkedSignal(() => this.formData().srvEmail ?? false);
  protected isScs = computed(() => this.currentUser()?.tenants.includes('scs') || this.currentUser()?.tenants.includes('test'));

// passing constants to template
  protected privacyUsages = PrivacyUsages;

  protected onFieldChange(fieldName: string, fieldValue: string | string[] | number | boolean): void {
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }

  protected onFormChange(value: UserPrivacyFormModel): void {
    this.formData.update((vm) => ({...vm, ...value}));
    debugFormErrors('UserPrivacyForm.onFormChange', this.validationResult().errors, this.currentUser());
  }

  protected onChange(fieldName: string, fieldValue: boolean | PrivacyUsage): void {
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
    debugFormErrors('UserPrivacyForm.onChange', this.validationResult().errors, this.currentUser());
  }
}

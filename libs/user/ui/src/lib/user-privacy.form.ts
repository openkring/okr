import { AsyncPipe } from "@angular/common";
import { Component, computed, input, model, output } from "@angular/core";
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
                <bk-cat name="usageImages" [value]="usageImages()" [categories]="privacyUsages" [readOnly]="readOnly()" (changed)="onChange('usageImages', $event)" />
              </ion-col>
              <ion-col size="12" size-md="6">                                                             
                <bk-cat name="usageDateOfBirth" [value]="usageDateOfBirth()" [categories]="privacyUsages" [readOnly]="readOnly()" (changed)="onChange('usageDateOfBirth', $event)" />
              </ion-col>
              <ion-col size="12" size-md="6">                                                             
                <bk-cat name="usagePostalAddress" [value]="usagePostalAddress()" [categories]="privacyUsages" [readOnly]="readOnly()" (changed)="onChange('usagePostalAddress', $event)" />
              </ion-col>
              <ion-col size="12" size-md="6">                                                             
                <bk-cat name="usageEmail" [value]="usageEmail()" [categories]="privacyUsages" [readOnly]="readOnly()" (changed)="onChange('usageEmail', $event)" />
              </ion-col>
              <ion-col size="12" size-md="6">                                                             
                <bk-cat name="usagePhone" [value]="usagePhone()" [categories]="privacyUsages" [readOnly]="readOnly()" (changed)="onChange('usagePhone', $event)" />
              </ion-col>
              <ion-col size="12" size-md="6">                                                             
                <bk-cat name="usageName" [value]="usageName()" [categories]="privacyUsages" [readOnly]="readOnly()" (changed)="onChange('usageName', $event)" />
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
                  <bk-checkbox name="srvEmail" [isChecked]="srvEmail()" [showHelper]="true" [readOnly]="readOnly()" (changed)="onChange('srvEmail', $event)" />
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
  protected usageImages = computed(() => this.formData().usageImages ?? PrivacyUsage.Restricted);
  protected usageDateOfBirth = computed(() => this.formData().usageDateOfBirth ?? PrivacyUsage.Restricted);
  protected usagePostalAddress = computed(() => this.formData().usagePostalAddress ?? PrivacyUsage.Restricted);
  protected usageEmail = computed(() => this.formData().usageEmail ?? PrivacyUsage.Restricted);
  protected usagePhone = computed(() => this.formData().usagePhone ?? PrivacyUsage.Restricted);
  protected usageName = computed(() => this.formData().usageName ?? PrivacyUsage.Restricted);
  protected isScs = computed(() => this.currentUser()?.tenants.includes('scs') || this.currentUser()?.tenants.includes('test'));
  protected srvEmail = computed(() => this.formData().srvEmail ?? true);

  // passing constants to template
  protected privacyUsages = PrivacyUsages;

  protected onFormChange(value: UserPrivacyFormModel): void {
    this.formData.update((vm) => ({...vm, ...value}));
    debugFormErrors('UserPrivacyForm.onFormChange', this.validationResult().errors, this.currentUser());
  }

  protected onChange(fieldName: string, fieldValue: string | string[] | number | boolean): void {
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
    debugFormErrors('UserPrivacyForm.onChange', this.validationResult().errors, this.currentUser());
  }
}

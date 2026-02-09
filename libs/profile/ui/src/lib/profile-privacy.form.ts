import { AsyncPipe } from "@angular/common";
import { Component, computed, inject, input, linkedSignal, model, output } from "@angular/core";
import { IonAccordion, IonCol, IonGrid, IonItem, IonLabel, IonRow, ModalController } from "@ionic/angular/standalone";
import { vestForms, vestFormsViewProviders } from "ngx-vest-forms";

import { PrivacyUsages } from "@bk2/shared-categories";
import { TranslatePipe } from "@bk2/shared-i18n";
import { PrivacyUsage, UserModel } from "@bk2/shared-models";
import { CategoryComponent, CheckboxComponent } from "@bk2/shared-ui";
import { coerceBoolean, debugFormErrors, debugFormModel } from "@bk2/shared-util-core";

import { userValidations } from "@bk2/user-util";

@Component({
  selector: 'bk-profile-privacy-accordion',
  standalone: true,
  imports: [ 
    TranslatePipe, AsyncPipe,
    vestForms,
    IonAccordion, IonItem, IonLabel, IonGrid, IonRow, IonCol,
    CategoryComponent, CheckboxComponent
  ],
  styles: [`
    ion-icon { padding-right: 5px; }
    @media (width <= 600px) { ion-card { margin: 5px;}}
  `],
  viewProviders: [vestFormsViewProviders],
  template: `
  <ion-accordion toggle-icon-slot="start" value="profile-privacy">
    <ion-item slot="header" [color]="color()">
        <ion-label>{{ title() | translate | async }}</ion-label>
    </ion-item>
    <div slot="content">
      @if (showForm()) {
        <form scVestForm
            [formValue]="formData()"
            [suite]="suite" 
            (dirtyChange)="dirty.emit($event)"
            (validChange)="valid.emit($event)"
            (formValueChange)="onFormChange($event)">

          <ion-grid>        
            <ion-row>
              <ion-col>
                <ion-item lines="none">
                  <ion-label>{{ '@profile.privacy.description' | translate | async }}</ion-label>
                </ion-item>
              </ion-col>
            </ion-row>
            <ion-row> 
              <ion-col size="12" size-md="6">
                <bk-cat name="usageImages" [value]="usageImages()" (valueChange)="onFieldChange('usageImages', $event)" [categories]="privacyUsages" [readOnly]="isReadOnly()" />  
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-cat name="usageDateOfBirth" [value]="usageDateOfBirth()" (valueChange)="onFieldChange('usageDateOfBirth', $event)" [categories]="privacyUsages" [readOnly]="isReadOnly()" />  
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-cat name="usagePostalAddress" [value]="usagePostalAddress()" (valueChange)="onFieldChange('usagePostalAddress', $event)" [categories]="privacyUsages" [readOnly]="isReadOnly()" />  
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-cat name="usageEmail" [value]="usageEmail()" (valueChange)="onFieldChange('usageEmail', $event)" [categories]="privacyUsages" [readOnly]="isReadOnly()" />  
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-cat name="usagePhone" [value]="usagePhone()" (valueChange)="onFieldChange('usagePhone', $event)" [categories]="privacyUsages" [readOnly]="isReadOnly()" />  
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-cat name="usageName" [value]="usageName()" (valueChange)="onFieldChange('usageName', $event)" [categories]="privacyUsages" [readOnly]="isReadOnly()" />  
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
                  <bk-checkbox name="srvEmail" [checked]="srvEmail()" (checkedChange)="onFieldChange('srvEmail', $event)" [showHelper]="showHelper()" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
            }
          </ion-grid>
        </form>
      }
    </div>
  </ion-accordion>
  `,
})
export class ProfilePrivacyAccordionComponent {
  // inputs
  public formData = model.required<UserModel>();
  public readonly currentUser = input<UserModel | undefined>();
  public showForm = input<boolean>(true);   // used for initializing the form and resetting vest validations
  public color = input('light'); // color of the accordion
  public readonly title = input('@profile.privacy.title'); // title of the accordion
  public readonly tenantId = input.required<string>();
  public readonly tags = input.required<string>();
  public readonly readOnly = input<boolean>(true);
  public readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();

  // validation and errors
  protected readonly suite = userValidations;
  private readonly validationResult = computed(() => userValidations(this.formData(), this.tenantId(), this.tags()));

  // fields
  protected usageImages = linkedSignal(() => this.formData().usageImages ?? PrivacyUsage.Public);
  protected usageDateOfBirth = linkedSignal(() => this.formData().usageDateOfBirth ?? PrivacyUsage.Restricted);
  protected usagePostalAddress = linkedSignal(() => this.formData().usagePostalAddress ?? PrivacyUsage.Restricted);
  protected usageEmail = linkedSignal(() => this.formData().usageEmail ?? PrivacyUsage.Restricted);
  protected usagePhone = linkedSignal(() => this.formData().usagePhone ?? PrivacyUsage.Restricted);
  protected usageName = linkedSignal(() => this.formData().usageName ?? PrivacyUsage.Restricted);
  protected isScs = computed(() => this.currentUser()?.tenants.includes('scs') || this.currentUser()?.tenants.includes('test'));
  protected srvEmail = linkedSignal(() => this.formData().srvEmail ?? true);
  protected showHelper = computed(() => this.currentUser()?.showHelpers ?? true);

  // passing constants to template
  protected privacyUsages = PrivacyUsages;

  /******************************* actions *************************************** */
  protected onFieldChange(fieldName: string, fieldValue: string | string[] | number | boolean): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }

  protected onFormChange(value: UserModel): void {
    this.formData.update((vm) => ({...vm, ...value}));
    debugFormModel('ProfilePrivacy.onFormChange', this.formData(), this.currentUser());
    debugFormErrors('ProfilePrivacy.onFormChange', this.validationResult().errors, this.currentUser());
  }
}

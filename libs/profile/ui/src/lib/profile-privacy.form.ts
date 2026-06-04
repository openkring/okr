import { Component, computed, input, linkedSignal, model, output, Signal } from "@angular/core";
import { IonAccordion, IonCol, IonGrid, IonItem, IonLabel, IonRow } from "@ionic/angular/standalone";
import { vestForms, vestFormsViewProviders } from "ngx-vest-forms";

import { PrivacyUsages } from "@bk2/shared-categories";
import { PrivacyUsage, UserModel } from "@bk2/shared-models";
import { CategoryOld, CategoryOldI18n, Checkbox, CheckboxI18n } from "@bk2/shared-ui";
import { coerceBoolean, debugFormErrors, debugFormModel } from "@bk2/shared-util-core";

import { userValidations } from "@bk2/user-util";
import { ProfileI18n } from "@bk2/profile-util";

@Component({
  selector: 'bk-profile-privacy-accordion',
  standalone: true,
  imports: [
    vestForms,
    IonAccordion, IonItem, IonLabel, IonGrid, IonRow, IonCol,
    CategoryOld, Checkbox
  ],
  styles: [`
    ion-icon { padding-right: 5px; }
    @media (width <= 600px) { ion-card { margin: 5px;}}
  `],
  viewProviders: [vestFormsViewProviders],
  template: `
  <ion-accordion toggle-icon-slot="start" value="profile-privacy">
    <ion-item slot="header" [color]="color()">
        <ion-label>{{ i18n().privacy_title() }}</ion-label>
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
                  <ion-label>{{ i18n().privacy_description() }}</ion-label>
                </ion-item>
              </ion-col>
            </ion-row>
            <ion-row> 
              <ion-col size="12" size-md="6">
                <bk-category-old [i18n]="usageImagesI18n()" [value]="usageImages()" (valueChange)="onFieldChange('usageImages', $event)" [categories]="privacyUsages" [readOnly]="isReadOnly()" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-category-old [i18n]="usageDateOfBirthI18n()" [value]="usageDateOfBirth()" (valueChange)="onFieldChange('usageDateOfBirth', $event)" [categories]="privacyUsages" [readOnly]="isReadOnly()" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-category-old [i18n]="usagePostalAddressI18n()" [value]="usagePostalAddress()" (valueChange)="onFieldChange('usagePostalAddress', $event)" [categories]="privacyUsages" [readOnly]="isReadOnly()" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-category-old [i18n]="usageEmailI18n()" [value]="usageEmail()" (valueChange)="onFieldChange('usageEmail', $event)" [categories]="privacyUsages" [readOnly]="isReadOnly()" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-category-old [i18n]="usagePhoneI18n()" [value]="usagePhone()" (valueChange)="onFieldChange('usagePhone', $event)" [categories]="privacyUsages" [readOnly]="isReadOnly()" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-category-old [i18n]="usageNameI18n()" [value]="usageName()" (valueChange)="onFieldChange('usageName', $event)" [categories]="privacyUsages" [readOnly]="isReadOnly()" />
              </ion-col>
            </ion-row>
            @if(isScs()) {
              <ion-row>
                <ion-col>
                  <ion-item lines="none">
                    <ion-label>{{ i18n().usage_srv_info() }}</ion-label>
                  </ion-item>
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col>
                  <bk-checkbox [i18n]="srvEmailI18n()" [checked]="srvEmail()" (checkedChange)="onFieldChange('srvEmail', $event)" [showHelper]="showHelper()" [readOnly]="isReadOnly()" />
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
export class ProfilePrivacyAccordion {
  protected usageImagesI18n        = computed(() => ({ name: 'usageImages',        label: this.i18n().usage_images()  } as CategoryOldI18n));
  protected usageDateOfBirthI18n   = computed(() => ({ name: 'usageDateOfBirth',   label: this.i18n().usage_dob()     } as CategoryOldI18n));
  protected usagePostalAddressI18n = computed(() => ({ name: 'usagePostalAddress', label: this.i18n().usage_postal()  } as CategoryOldI18n));
  protected usageEmailI18n         = computed(() => ({ name: 'usageEmail',         label: this.i18n().usage_email()   } as CategoryOldI18n));
  protected usagePhoneI18n         = computed(() => ({ name: 'usagePhone',         label: this.i18n().usage_phone()   } as CategoryOldI18n));
  protected usageNameI18n          = computed(() => ({ name: 'usageName',          label: this.i18n().usage_name()    } as CategoryOldI18n));
  protected srvEmailI18n           = computed(() => ({ name: 'srvEmail', label: this.i18n().usage_srv_label(), helper: this.i18n().usage_srv_helper() } as CheckboxI18n));

  // inputs
  public readonly i18n = input.required<ProfileI18n>();
  public formData = model.required<UserModel>();
  public readonly currentUser = input<UserModel | undefined>();
  public showForm = input<boolean>(true);   // used for initializing the form and resetting vest validations
  public color = input('light'); // color of the accordion
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

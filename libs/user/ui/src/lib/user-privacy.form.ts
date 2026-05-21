import { Component, computed, inject, input, linkedSignal, model, output } from "@angular/core";
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonItem, IonLabel, IonRow } from "@ionic/angular/standalone";
import { vestForms, vestFormsViewProviders } from "ngx-vest-forms";

import { PrivacyUsages } from "@bk2/shared-categories";
import { PrivacyUsage, UserModel } from "@bk2/shared-models";
import { CategoryOld, CategoryOldI18n, Checkbox, CheckboxI18n } from "@bk2/shared-ui";
import { I18nService } from "@bk2/shared-i18n";
import { coerceBoolean, debugFormErrors } from "@bk2/shared-util-core";

import { USER_PRIVACY_FORM_SHAPE, UserPrivacyFormModel, userPrivacyFormValidations } from "@bk2/user-util";
import { PFX } from "./scope";

export interface UserPrivacyFormI18n {
  privacyTitle: string;
  privacyDescription: string;
  srvDescription: string;
}

@Component({
  selector: 'bk-user-privacy-form',
  standalone: true,
  imports: [
    vestForms,
    CategoryOld, Checkbox,
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
          <ion-card-title>{{ i18n().privacyTitle }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
        {{ i18n().privacyDescription }}
          <ion-grid>
            <ion-row>
              <ion-col size="12" size-md="6">
                <bk-category-old [i18n]="usageImagesI18n()" [value]="usageImages()" (valueChange)="onFieldChange('usageImages', $event)" [categories]="privacyUsages" [readOnly]="readOnly()" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-category-old [i18n]="usageDateOfBirthI18n()" [value]="usageDateOfBirth()" (valueChange)="onFieldChange('usageDateOfBirth', $event)" [categories]="privacyUsages" [readOnly]="readOnly()" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-category-old [i18n]="usagePostalAddressI18n()" [value]="usagePostalAddress()" (valueChange)="onFieldChange('usagePostalAddress', $event)" [categories]="privacyUsages" [readOnly]="readOnly()" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-category-old [i18n]="usageEmailI18n()" [value]="usageEmail()" (valueChange)="onFieldChange('usageEmail', $event)" [categories]="privacyUsages" [readOnly]="readOnly()" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-category-old [i18n]="usagePhoneI18n()" [value]="usagePhone()" (valueChange)="onFieldChange('usagePhone', $event)" [categories]="privacyUsages" [readOnly]="readOnly()" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-category-old [i18n]="usageNameI18n()" [value]="usageName()" (valueChange)="onFieldChange('usageName', $event)" [categories]="privacyUsages" [readOnly]="readOnly()" />
              </ion-col>
            </ion-row>
            @if(isScs()) {
              <ion-row>
                <ion-col>
                  <ion-item lines="none">
                    <ion-label>{{ i18n().srvDescription }}</ion-label>
                  </ion-item>
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col>
                  <bk-checkbox [i18n]="srvEmailI18n()" [checked]="srvEmail()" (checkedChange)="onFieldChange('srvEmail', $event)" [showHelper]="true" [readOnly]="readOnly()" />
                </ion-col>
              </ion-row>
            }
          </ion-grid>
        </ion-card-content>
      </ion-card>
    </form>
  `
})
export class UserPrivacyForm {
  private readonly i18nService = inject(I18nService);
  protected readonly fieldI18n = this.i18nService.translateAll({
    usageImages_label:        PFX + 'usageImages.label',
    usageDateOfBirth_label:   PFX + 'usageDateOfBirth.label',
    usagePostalAddress_label: PFX + 'usagePostalAddress.label',
    usageEmail_label:         PFX + 'usageEmail.label',
    usagePhone_label:         PFX + 'usagePhone.label',
    usageName_label:          PFX + 'usageName.label',
    srvEmail_label:           PFX + 'srvEmail.label',
    srvEmail_helper:          PFX + 'srvEmail.helper',
  });
  protected usageImagesI18n        = computed(() => ({ name: 'usageImages',        label: this.fieldI18n.usageImages_label()        } as CategoryOldI18n));
  protected usageDateOfBirthI18n   = computed(() => ({ name: 'usageDateOfBirth',   label: this.fieldI18n.usageDateOfBirth_label()   } as CategoryOldI18n));
  protected usagePostalAddressI18n = computed(() => ({ name: 'usagePostalAddress', label: this.fieldI18n.usagePostalAddress_label() } as CategoryOldI18n));
  protected usageEmailI18n         = computed(() => ({ name: 'usageEmail',         label: this.fieldI18n.usageEmail_label()         } as CategoryOldI18n));
  protected usagePhoneI18n         = computed(() => ({ name: 'usagePhone',         label: this.fieldI18n.usagePhone_label()         } as CategoryOldI18n));
  protected usageNameI18n          = computed(() => ({ name: 'usageName',          label: this.fieldI18n.usageName_label()          } as CategoryOldI18n));
  protected srvEmailI18n           = computed(() => ({ name: 'srvEmail', label: this.fieldI18n.srvEmail_label(), helper: this.fieldI18n.srvEmail_helper() } as CheckboxI18n));

  // inputs
  public readonly i18n = input<UserPrivacyFormI18n>({ privacyTitle: '', privacyDescription: '', srvDescription: '' });
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
    this.dirty.emit(true);
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

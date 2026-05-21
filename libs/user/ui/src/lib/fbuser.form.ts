import { Component, computed, effect, inject, input, linkedSignal, model, output } from "@angular/core";
import { IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCol, IonGrid, IonRow } from "@ionic/angular/standalone";
import { vestForms, vestFormsViewProviders } from "ngx-vest-forms";

import { FirebaseUserModel, UserModel } from "@bk2/shared-models";
import { Checkbox, CheckboxI18n, EmailInput, EmailInputI18n, ErrorNote, PhoneInput, PhoneInputI18n, TextInput, TextInputI18n } from "@bk2/shared-ui";
import { coerceBoolean, debugFormErrors } from "@bk2/shared-util-core";
import { I18nService } from "@bk2/shared-i18n";

import { FIREBASE_USER_SHAPE, firebaseUserFormValidations } from "@bk2/user-util";
import { PFX } from "./scope";

export interface FbUserFormI18n {
  authTitle: string;
  authDescription: string;
}

@Component({
  selector: 'bk-fbuser-form',
  standalone: true,
  imports: [
    vestForms,
    Checkbox, TextInput, EmailInput, PhoneInput, ErrorNote,
    IonCard, IonCardHeader, IonCardContent, IonCardTitle, IonGrid, IonRow, IonCol, IonCardSubtitle
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  viewProviders: [vestFormsViewProviders],
  template: `
    <form scVestForm
      [formValue]="formData()"
      (formValueChange)="onFormChange($event)"
      [suite]="suite" 
      (dirtyChange)="dirty.emit($event)"
      (validChange)="valid.emit($event)"
    >
      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ i18n().authTitle }}</ion-card-title>
          <ion-card-subtitle>{{ i18n().authDescription }}</ion-card-subtitle>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col size="12" size-md="6">
                <bk-text-input [i18n]="uidI18n()" [value]="uid()" (valueChange)="onFieldChange('uid', $event)" [readOnly]="isReadOnly()" [copyable]=true />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-text-input [i18n]="displayNameI18n()" [readOnly]="isReadOnly()" [value]="displayName()" (valueChange)="onFieldChange('displayName', $event)" [copyable]=true />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-email
                  [i18n]="emailI18n()"
                  [value]="email()"
                  (valueChange)="onFieldChange('email', $event)"
                  [readOnly]="isReadOnly()"
                />
                <bk-error-note [errors]="emailError()" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-phone
                  [i18n]="phoneI18n()"
                  [value]="phone()"
                  (valueChange)="onFieldChange('phone', $event)"
                  [readOnly]="isReadOnly()"
                />
                <bk-error-note [errors]="phoneError()" />                                                                                                                     
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-checkbox [i18n]="emailVerifiedI18n()" [checked]="emailVerified()" (checkedChange)="onFieldChange('emailVerified', $event)" [showHelper]="true"  [readOnly]="isReadOnly()" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-checkbox [i18n]="disabledI18n()" [checked]="disabled()" (checkedChange)="onFieldChange('disabled', $event)" [showHelper]="true"  [readOnly]="isReadOnly()" />
              </ion-col>
              <ion-col size="12">
                <bk-text-input [i18n]="photoUrlI18n()" [readOnly]="isReadOnly()" [value]="photoUrl()" (valueChange)="onFieldChange('photoUrl', $event)" [copyable]=true />
              </ion-col>
            </ion-row>
            <ion-row>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>
    </form>
  `
})
export class FbuserForm {
  // inputs
  public readonly i18n = input<FbUserFormI18n>({ authTitle: '', authDescription: '' });
  public formData = model.required<FirebaseUserModel>();
  public currentUser = input<UserModel | undefined>();
  public readonly readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  private readonly i18nService = inject(I18nService);
  protected readonly fieldI18n = this.i18nService.translateAll({
    uid_label:           PFX + 'uid.label',
    uid_placeholder:     PFX + 'uid.placeholder',
    uid_helper:          PFX + 'uid.helper',
    displayName_label:   PFX + 'displayName.label',
    displayName_placeholder: PFX + 'displayName.placeholder',
    displayName_helper:  PFX + 'displayName.helper',
    photoUrl_label:      PFX + 'photoUrl.label',
    photoUrl_placeholder: PFX + 'photoUrl.placeholder',
    photoUrl_helper:     PFX + 'photoUrl.helper',
    email_label:         PFX + 'email.label',
    email_placeholder:   PFX + 'email.placeholder',
    phone_label:         PFX + 'phone.label',
    phone_placeholder:   PFX + 'phone.placeholder',
    emailVerified_label: PFX + 'emailVerified.label',
    emailVerified_helper: PFX + 'emailVerified.helper',
    disabled_label:      PFX + 'disabled.label',
    disabled_helper:     PFX + 'disabled.helper',
  });

  protected uidI18n = computed(() => ({
    name: 'uid', label: this.fieldI18n.uid_label(), placeholder: this.fieldI18n.uid_placeholder(), helper: this.fieldI18n.uid_helper()
  } as TextInputI18n));

  protected displayNameI18n = computed(() => ({
    name: 'displayName', label: this.fieldI18n.displayName_label(), placeholder: this.fieldI18n.displayName_placeholder(), helper: this.fieldI18n.displayName_helper()
  } as TextInputI18n));

  protected photoUrlI18n = computed(() => ({
    name: 'photoUrl', label: this.fieldI18n.photoUrl_label(), placeholder: this.fieldI18n.photoUrl_placeholder(), helper: this.fieldI18n.photoUrl_helper()
  } as TextInputI18n));

  protected emailI18n = computed(() => ({ name: 'email', label: this.fieldI18n.email_label(), placeholder: this.fieldI18n.email_placeholder() } as EmailInputI18n));
  protected phoneI18n = computed(() => ({ name: 'phone', label: this.fieldI18n.phone_label(), placeholder: this.fieldI18n.phone_placeholder() } as PhoneInputI18n));
  protected emailVerifiedI18n = computed(() => ({ name: 'emailVerified', label: this.fieldI18n.emailVerified_label(), helper: this.fieldI18n.emailVerified_helper() } as CheckboxI18n));
  protected disabledI18n = computed(() => ({ name: 'disabled', label: this.fieldI18n.disabled_label(), helper: this.fieldI18n.disabled_helper() } as CheckboxI18n));

  // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();

  // validation and errors
  protected readonly suite = firebaseUserFormValidations;
  protected readonly shape = FIREBASE_USER_SHAPE;
  private readonly validationResult = computed(() => firebaseUserFormValidations(this.formData()));
  protected emailError = computed(() => this.validationResult().getErrors('email'));
  protected phoneError = computed(() => this.validationResult().getErrors('phone'));

  // fields
  protected uid = linkedSignal(() => this.formData().uid ?? '');
  protected email = linkedSignal(() => this.formData().email ?? '');
  protected displayName = linkedSignal(() => this.formData().displayName ?? '');
  protected emailVerified = linkedSignal(() => this.formData().emailVerified ?? false);
  protected disabled = linkedSignal(() => this.formData().disabled ?? false);
  protected phone = linkedSignal(() => this.formData().phone ?? '');
  protected photoUrl = linkedSignal(() => this.formData().photoUrl ?? '');

  constructor() {
    effect(() => {
      this.valid.emit(this.validationResult().isValid());
    });
  }

  protected onFormChange(value: FirebaseUserModel): void {
    this.formData.update((vm) => ({...vm, ...value}));
    debugFormErrors('FbuserForm.onFormChange', this.validationResult().errors, this.currentUser());
  }

  protected onFieldChange(fieldName: string, fieldValue: string | boolean): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
    debugFormErrors('FbuserForm.onFieldChange', this.validationResult().errors, this.currentUser());
  }
}


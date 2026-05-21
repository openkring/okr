import { Component, computed, effect, inject, input, linkedSignal, model, output } from "@angular/core";
import { IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCol, IonGrid, IonRow } from "@ionic/angular/standalone";
import { vestForms, vestFormsViewProviders } from "ngx-vest-forms";

import { RoleName, UserModel } from "@bk2/shared-models";
import { EmailInput, EmailInputI18n, NotesInput, NotesInputI18n, TextInput, TextInputI18n } from "@bk2/shared-ui";
import { coerceBoolean, debugFormErrors, hasRole } from "@bk2/shared-util-core";
import { I18nService } from "@bk2/shared-i18n";

import { USER_FORM_SHAPE, UserModelFormModel, userModelFormValidations } from "@bk2/user-util";
import { PFX } from "./scope";

export interface UserModelFormI18n {
  modelTitle: string;
  modelDescription: string;
}

@Component({
  selector: 'bk-user-model-form',
  standalone: true,
  imports: [
    vestForms,
    EmailInput, NotesInput, TextInput,
    IonCard, IonCardHeader, IonCardContent, IonCardTitle, IonGrid, IonRow, IonCol, IonCardSubtitle
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
          <ion-card-title>{{ i18n().modelTitle }}</ion-card-title>
          <ion-card-subtitle>{{ i18n().modelDescription }}</ion-card-subtitle>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col size="12" size-md="6">
                <bk-text-input [i18n]="bkeyI18n()" [value]="bkey()" (valueChange)="onFieldChange('bkey', $event)" [readOnly]="true" [copyable]=true />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-text-input [i18n]="personKeyI18n()" [value]="personKey()" (valueChange)="onFieldChange('personKey', $event)" [readOnly]="isReadOnly()" [copyable]=true />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-text-input [i18n]="firstNameI18n()" [value]="firstName()" (valueChange)="onFieldChange('firstName', $event)" [copyable]=true [readOnly]="isReadOnly()" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-text-input [i18n]="lastNameI18n()" [value]="lastName()" (valueChange)="onFieldChange('lastName', $event)" [copyable]=true [readOnly]="isReadOnly()" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-email [i18n]="loginEmailI18n()" [value]="loginEmail()" (valueChange)="onFieldChange('loginEmail', $event)" [readOnly]="isReadOnly()" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-email [i18n]="gravatarEmailI18n()" [value]="gravatarEmail()" (valueChange)="onFieldChange('gravatarEmail', $event)" [readOnly]="isReadOnly()" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-text-input [i18n]="tenantsI18n()" [value]="tenants()" (valueChange)="onFieldChange('tenants', $event)" [readOnly]="isReadOnly()" [copyable]=true />
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>
      @if(hasRole('admin')) {
        <bk-notes-input [i18n]="notesI18n()" [value]="notes()" (valueChange)="onFieldChange('notes', $event)" [readOnly]="isReadOnly()" />
      }
    </form>
  `
})
export class UserModelForm {
  // inputs
  public readonly i18n = input<UserModelFormI18n>({ modelTitle: '', modelDescription: '' });
  public formData = model.required<UserModelFormModel>();
  public currentUser = input<UserModel | undefined>();
  public readonly readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  private readonly i18nService = inject(I18nService);
  protected readonly fieldI18n = this.i18nService.translateAll({
    bkey_label:          PFX + 'bkey.label',
    bkey_placeholder:    PFX + 'bkey.placeholder',
    bkey_helper:         PFX + 'bkey.helper',
    personKey_label:     PFX + 'personKey.label',
    personKey_placeholder: PFX + 'personKey.placeholder',
    personKey_helper:    PFX + 'personKey.helper',
    firstName_label:     PFX + 'firstName.label',
    firstName_placeholder: PFX + 'firstName.placeholder',
    firstName_helper:    PFX + 'firstName.helper',
    lastName_label:      PFX + 'lastName.label',
    lastName_placeholder: PFX + 'lastName.placeholder',
    lastName_helper:     PFX + 'lastName.helper',
    tenants_label:       PFX + 'tenants.label',
    tenants_placeholder: PFX + 'tenants.placeholder',
    tenants_helper:      PFX + 'tenants.helper',
    notes_label:              PFX + 'notes.label',
    notes_placeholder:        PFX + 'notes.placeholder',
    loginEmail_label:         PFX + 'loginEmail.label',
    loginEmail_placeholder:   PFX + 'loginEmail.placeholder',
    gravatarEmail_label:      PFX + 'gravatarEmail.label',
    gravatarEmail_placeholder:PFX + 'gravatarEmail.placeholder',
  });

  protected bkeyI18n = computed(() => ({
    name: 'bkey', label: this.fieldI18n.bkey_label(), placeholder: this.fieldI18n.bkey_placeholder(), helper: this.fieldI18n.bkey_helper()
  } as TextInputI18n));

  protected personKeyI18n = computed(() => ({
    name: 'personKey', label: this.fieldI18n.personKey_label(), placeholder: this.fieldI18n.personKey_placeholder(), helper: this.fieldI18n.personKey_helper()
  } as TextInputI18n));

  protected firstNameI18n = computed(() => ({
    name: 'firstName', label: this.fieldI18n.firstName_label(), placeholder: this.fieldI18n.firstName_placeholder(), helper: this.fieldI18n.firstName_helper()
  } as TextInputI18n));

  protected lastNameI18n = computed(() => ({
    name: 'lastName', label: this.fieldI18n.lastName_label(), placeholder: this.fieldI18n.lastName_placeholder(), helper: this.fieldI18n.lastName_helper()
  } as TextInputI18n));

  protected tenantsI18n = computed(() => ({
    name: 'tenants', label: this.fieldI18n.tenants_label(), placeholder: this.fieldI18n.tenants_placeholder(), helper: this.fieldI18n.tenants_helper()
  } as TextInputI18n));

  protected notesI18n = computed(() => ({
    name: 'notes',
    label: this.fieldI18n.notes_label(),
    placeholder: this.fieldI18n.notes_placeholder()
  } as NotesInputI18n));

  protected loginEmailI18n = computed(() => ({ name: 'loginEmail', label: this.fieldI18n.loginEmail_label(), placeholder: this.fieldI18n.loginEmail_placeholder() } as EmailInputI18n));
  protected gravatarEmailI18n = computed(() => ({ name: 'gravatarEmail', label: this.fieldI18n.gravatarEmail_label(), placeholder: this.fieldI18n.gravatarEmail_placeholder() } as EmailInputI18n));

  // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();

  // validation and errors
  protected readonly suite = userModelFormValidations;
  protected readonly shape = USER_FORM_SHAPE;
  private readonly validationResult = computed(() => userModelFormValidations(this.formData()));

  // fields
  protected bkey = linkedSignal(() => this.formData().bkey);
  protected tenants = linkedSignal(() => {
    const tenants = this.formData().tenants;
    return Array.isArray(tenants) ? tenants.join(',') : tenants;
  });
  protected personKey = linkedSignal(() => this.formData().personKey);
  protected firstName = linkedSignal(() => this.formData().firstName);
  protected lastName = linkedSignal(() => this.formData().lastName);
  protected loginEmail = linkedSignal(() => this.formData().loginEmail);
  protected gravatarEmail = linkedSignal(() => this.formData().gravatarEmail);
  protected notes = linkedSignal(() => this.formData().notes);

  constructor() {
    effect(() => {
      this.valid.emit(this.validationResult().isValid());
    });
  }

  protected onFormChange(value: UserModelFormModel): void {
    this.formData.update((vm) => ({...vm, ...value}));
    debugFormErrors('UserModelForm.onFormChange', this.validationResult().errors, this.currentUser());
  }

  protected onFieldChange(fieldName: string, fieldValue: string | string[] | number | boolean): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
    debugFormErrors('UserModelForm.onFieldChange', this.validationResult().errors, this.currentUser());
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}

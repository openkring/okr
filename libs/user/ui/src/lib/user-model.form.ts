import { Component, computed, effect, input, linkedSignal, model, output, Signal } from "@angular/core";
import { IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCol, IonGrid, IonRow } from "@ionic/angular/standalone";

import { RoleName, UserModel } from "@bk2/shared-models";
import { EmailInput, EmailInputI18n, NotesInput, NotesInputI18n, TextInput, TextInputI18n } from "@bk2/shared-ui";
import { coerceBoolean, hasRole } from "@bk2/shared-util-core";

import { USER_FORM_SHAPE, UserI18n, UserModelFormModel, userModelFormValidations } from "@bk2/user-util";

@Component({
  selector: 'bk-user-model-form',
  standalone: true,
  imports: [
    EmailInput, NotesInput, TextInput,
    IonCard, IonCardHeader, IonCardContent, IonCardTitle, IonGrid, IonRow, IonCol, IonCardSubtitle
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    <form novalidate>
      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ i18n().model_title() }}</ion-card-title>
          <ion-card-subtitle>{{ i18n().model_description() }}</ion-card-subtitle>
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
  public readonly i18n = input.required<UserI18n>();
  public formData = model.required<UserModelFormModel>();
  public currentUser = input<UserModel | undefined>();
  public readonly readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  protected bkeyI18n = computed(() => ({
    name: 'bkey', label: this.i18n().bkey_label(), placeholder: this.i18n().bkey_placeholder(), helper: this.i18n().bkey_helper()
  } as TextInputI18n));

  protected personKeyI18n = computed(() => ({
    name: 'personKey', label: this.i18n().personKey_label(), placeholder: this.i18n().personKey_placeholder(), helper: this.i18n().personKey_helper()
  } as TextInputI18n));

  protected firstNameI18n = computed(() => ({
    name: 'firstName', label: this.i18n().firstName_label(), placeholder: this.i18n().firstName_placeholder(), helper: this.i18n().firstName_helper()
  } as TextInputI18n));

  protected lastNameI18n = computed(() => ({
    name: 'lastName', label: this.i18n().lastName_label(), placeholder: this.i18n().lastName_placeholder(), helper: this.i18n().lastName_helper()
  } as TextInputI18n));

  protected tenantsI18n = computed(() => ({
    name: 'tenants', label: this.i18n().tenants_label(), placeholder: this.i18n().tenants_placeholder(), helper: this.i18n().tenants_helper()
  } as TextInputI18n));

  protected notesI18n = computed(() => ({
    name: 'notes',
    label: this.i18n().notes_label(),
    placeholder: this.i18n().notes_placeholder()
  } as NotesInputI18n));

  protected loginEmailI18n = computed(() => ({ name: 'loginEmail', label: this.i18n().loginEmail_label(), placeholder: this.i18n().loginEmail_placeholder() } as EmailInputI18n));
  protected gravatarEmailI18n = computed(() => ({ name: 'gravatarEmail', label: this.i18n().gravatarEmail_label(), placeholder: this.i18n().gravatarEmail_placeholder() } as EmailInputI18n));

  // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();

  // validation and errors
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

  protected onFieldChange(fieldName: string, fieldValue: string | string[] | number | boolean): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}

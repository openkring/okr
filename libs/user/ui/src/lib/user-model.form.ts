import { AsyncPipe } from "@angular/common";
import { Component, computed, effect, input, linkedSignal, model, output } from "@angular/core";
import { IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCol, IonGrid, IonRow } from "@ionic/angular/standalone";
import { vestForms, vestFormsViewProviders } from "ngx-vest-forms";

import { TranslatePipe } from "@bk2/shared-i18n";
import { UserModel } from "@bk2/shared-models";
import { EmailInputComponent, NotesInputComponent, TextInputComponent } from "@bk2/shared-ui";
import { coerceBoolean, debugFormErrors } from "@bk2/shared-util-core";

import { USER_FORM_SHAPE, UserModelFormModel, userModelFormValidations } from "@bk2/user-util";

@Component({
  selector: 'bk-user-model-form',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
    vestForms,
    TextInputComponent, EmailInputComponent, NotesInputComponent,
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
          <ion-card-title>{{ '@user.model.title' | translate | async }}</ion-card-title>
          <ion-card-subtitle>{{ '@user.model.description' | translate | async }}</ion-card-subtitle>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col size="12" size-md="6">
                <bk-text-input name="bkey" label="@input.userKey.label" placeholder="@input.userKey.placeholder" [value]="bkey()" (valueChange)="onFieldChange('bkey', $event)" [readOnly]="true" [copyable]=true />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-text-input name="personKey" [value]="personKey()" (valueChange)="onFieldChange('personKey', $event)" [readOnly]="isReadOnly()" [copyable]=true />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-text-input name="firstName" [value]="firstName()" (valueChange)="onFieldChange('firstName', $event)" [copyable]=true [readOnly]="isReadOnly()" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-text-input name="lastName" [value]="lastName()" (valueChange)="onFieldChange('lastName', $event)" [copyable]=true [readOnly]="isReadOnly()" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-email name="loginEmail" [value]="loginEmail()" (valueChange)="onFieldChange('loginEmail', $event)" [readOnly]="isReadOnly()" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-email name="gravatarEmail" [value]="gravatarEmail()" (valueChange)="onFieldChange('gravatarEmail', $event)" [readOnly]="isReadOnly()" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-text-input name="tenants" [value]="tenants()" (valueChange)="onFieldChange('tenants', $event)" [readOnly]="isReadOnly()" [copyable]=true />
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>
      <bk-notes [value]="notes()" (valueChange)="onFieldChange('notes', $event)" [readOnly]="isReadOnly()" />
    </form>
  `
})
export class UserModelFormComponent {
  // inputs
  public formData = model.required<UserModelFormModel>();
  public currentUser = input<UserModel | undefined>();
  public readonly readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

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
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
    debugFormErrors('UserModelForm.onFieldChange', this.validationResult().errors, this.currentUser());
  }
}

import { AsyncPipe } from "@angular/common";
import { Component, computed, effect, input, linkedSignal, model, output } from "@angular/core";
import { IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCol, IonGrid, IonRow } from "@ionic/angular/standalone";
import { vestForms, vestFormsViewProviders } from "ngx-vest-forms";

import { TranslatePipe } from "@bk2/shared-i18n";
import { FirebaseUserModel, UserModel } from "@bk2/shared-models";
import { CheckboxComponent, EmailInputComponent, ErrorNoteComponent, PhoneInputComponent, TextInputComponent } from "@bk2/shared-ui";
import { coerceBoolean, debugFormErrors } from "@bk2/shared-util-core";

import { FIREBASE_USER_SHAPE, firebaseUserFormValidations } from "@bk2/user-util";

@Component({
  selector: 'bk-fbuser-form',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
    vestForms,
    CheckboxComponent, TextInputComponent, EmailInputComponent, PhoneInputComponent, ErrorNoteComponent,
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
          <ion-card-title>{{ '@user.auth.title' | translate | async }}</ion-card-title>
          <ion-card-subtitle>{{ '@user.auth.description' | translate | async }}</ion-card-subtitle>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col size="12" size-md="6">
                <bk-text-input name="uid" label="@input.userKey.label" placeholder="@input.userKey.placeholder" [value]="uid()" (valueChange)="onFieldChange('uid', $event)" [readOnly]="isReadOnly()" [copyable]=true />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-text-input name="displayName" label="@input.displayName.label" placeholder="@input.displayName.placeholder"  [readOnly]="isReadOnly()" [value]="displayName()" (valueChange)="onFieldChange('displayName', $event)" [copyable]=true />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-email [value]="email()" (valueChange)="onFieldChange('email', $event)" [readOnly]="isReadOnly()"/>
                <bk-error-note [errors]="emailError()" />                                                                                                                     
              </ion-col>
              <ion-col size="12" size-md="6"> 
                <bk-phone [value]="phone()" (valueChange)="onFieldChange('phone', $event)" [readOnly]="isReadOnly()"/>
                <bk-error-note [errors]="phoneError()" />                                                                                                                     
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-checkbox name="emailVerified" [checked]="emailVerified()" (checkedChange)="onFieldChange('emailVerified', $event)" [showHelper]="true"  [readOnly]="isReadOnly()" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-checkbox name="disabled" [checked]="disabled()" (checkedChange)="onFieldChange('disabled', $event)" [showHelper]="true"  [readOnly]="isReadOnly()" />
              </ion-col>
              <ion-col size="12">
                <bk-text-input name="photoUrl" label="@input.photoUrl.label" placeholder="@input.photoUrl.placeholder" [readOnly]="isReadOnly()" [value]="photoUrl()" (valueChange)="onFieldChange('photoUrl', $event)" [copyable]=true />
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
export class FbuserFormComponent {
  // inputs
  public formData = model.required<FirebaseUserModel>();
  public currentUser = input<UserModel | undefined>();
  public readonly readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

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
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
    debugFormErrors('FbuserForm.onFieldChange', this.validationResult().errors, this.currentUser());
  }
}


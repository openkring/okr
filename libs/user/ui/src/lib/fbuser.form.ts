import { AsyncPipe } from "@angular/common";
import { Component, computed, input, model, output, signal } from "@angular/core";
import { IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCol, IonGrid, IonRow } from "@ionic/angular/standalone";
import { vestForms, vestFormsViewProviders } from "ngx-vest-forms";

import { TranslatePipe } from "@bk2/shared-i18n";
import { FirebaseUserModel, UserModel } from "@bk2/shared-models";
import { CheckboxComponent, EmailInputComponent, ErrorNoteComponent, PhoneInputComponent, TextInputComponent } from "@bk2/shared-ui";
import { debugFormErrors } from "@bk2/shared-util-core";

import { firebaseUserFormValidations, FirebaseUserShape } from "@bk2/user-util";

@Component({
  selector: 'bk-fbuser-form',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
    vestForms,
    CheckboxComponent, TextInputComponent, EmailInputComponent, PhoneInputComponent, ErrorNoteComponent,
    IonCard, IonCardHeader, IonCardContent, IonCardTitle, IonGrid, IonRow, IonCol, IonCardSubtitle
  ],
  viewProviders: [vestFormsViewProviders],
  template: `
    <form scVestForm
      [formShape]="shape"
      [formValue]="vm()"
      [suite]="suite" 
      (dirtyChange)="dirtyChange.set($event)"
      (formValueChange)="onValueChange($event)">
      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ '@user.auth.title' | translate | async }}</ion-card-title>
          <ion-card-subtitle>{{ '@user.auth.description' | translate | async }}</ion-card-subtitle>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col size="12" size-md="6">
                <bk-text-input name="uid" label="@input.userKey.label" placeholder="@input.userKey.placeholder" [value]="uid()"  [readOnly]="readOnly()" [copyable]=true />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-text-input name="displayName" label="@input.displayName.label" placeholder="@input.displayName.placeholder"  [readOnly]="readOnly()" [value]="displayName()" [copyable]=true />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-email [value]="email()" (changed)="onChange('email', $event)"  [readOnly]="readOnly()"/>
                <bk-error-note [errors]="emailError()" />                                                                                                                     
              </ion-col>
              <ion-col size="12" size-md="6"> 
                <bk-phone [value]="phone()" (changed)="onChange('phone', $event)"  [readOnly]="readOnly()"/>
                <bk-error-note [errors]="phoneError()" />                                                                                                                     
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-checkbox name="emailVerified" [isChecked]="emailVerified()" [showHelper]="true"  [readOnly]="readOnly()" (changed)="onChange('emailVerified', $event)" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-checkbox name="disabled" [isChecked]="disabled()" [showHelper]="true"  [readOnly]="readOnly()" (changed)="onChange('disabled', $event)" />
              </ion-col>
              <ion-col size="12">
                <bk-text-input name="photoUrl" label="@input.photoUrl.label" placeholder="@input.photoUrl.placeholder"  [readOnly]="readOnly()" [value]="photoUrl()" [copyable]=true />
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
  public vm = model.required<FirebaseUserModel>();
  public currentUser = input<UserModel | undefined>();
  public readOnly = input.required<boolean>();

  protected uid = computed(() => this.vm().uid ?? '');
  protected email = computed(() => this.vm().email ?? '');
  protected displayName = computed(() => this.vm().displayName ?? '');
  protected emailVerified = computed(() => this.vm().emailVerified ?? false);
  protected disabled = computed(() => this.vm().disabled ?? false);
  protected phone = computed(() => this.vm().phone ?? '');
  protected photoUrl = computed(() => this.vm().photoUrl ?? '');
  protected emailError = computed(() => this.validationResult().getErrors('email'));
  protected phoneError = computed(() => this.validationResult().getErrors('phone'));

  public validChange = output<boolean>();
  protected dirtyChange = signal(false);
  private readonly validationResult = computed(() => firebaseUserFormValidations(this.vm()));

  protected readonly suite = firebaseUserFormValidations;
  protected readonly shape = FirebaseUserShape;

  protected onValueChange(value: FirebaseUserModel): void {
    this.vm.update((_vm) => ({..._vm, ...value}));
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }

  protected onChange(fieldName: string, $event: string | boolean): void {
    this.vm.update((vm) => ({ ...vm, [fieldName]: $event }));
    debugFormErrors('FbuserForm', this.validationResult().errors, this.currentUser());
    this.dirtyChange.set(true); // it seems, that vest is not updating dirty by itself for this change
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }
}


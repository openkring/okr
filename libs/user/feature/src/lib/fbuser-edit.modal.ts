import { Component, computed, inject, input, linkedSignal, signal } from "@angular/core";
import { IonContent, ModalController } from "@ionic/angular/standalone";

import { FirebaseUserModel, UserModel } from "@bk2/shared-models";
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from "@bk2/shared-ui";
import { hasRole, removeUndefinedFields } from "@bk2/shared-util-core";

import { FbuserForm } from "@bk2/user-ui";
import { UserStore } from "./user.store";

@Component({
  selector: 'bk-fbuser-edit-modal',
  standalone: true,
  imports: [
    Header, ChangeConfirmation, FbuserForm,
    IonContent
  ],
  providers: [UserStore],
  template: `
    <bk-header [i18n]="{ title: store.i18n.fbuser_title() }" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
      } 
    <ion-content>
      <bk-fbuser-form
        [i18n]="store.i18n"
        [formData]="formData()"
        (formDataChange)="onFormDataChange($event)"
        [currentUser]="currentUser()"
        [readOnly]="readOnly()"
        (dirty)="formDirty.set($event)"
        (valid)="formValid.set($event)"
      />
    </ion-content>
  `
})
export class FbuserEditModal {
  private readonly modalController = inject(ModalController);
  protected readonly store = inject(UserStore);

  // inputs
  public fbuser = input.required<FirebaseUserModel>();
  public currentUser = input.required<UserModel | undefined>();
  protected readonly readOnly = computed(() => !hasRole('admin', this.currentUser()));

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  public formData = linkedSignal(() => Object.assign(new FirebaseUserModel(), removeUndefinedFields(this.fbuser() as unknown as Record<string, unknown>)));

  // derived
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({ cancel: this.store.i18n.cancel(), save: this.store.i18n.save()} as ChangeConfirmationI18n));

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    this.formDirty.set(false);
    await this.modalController.dismiss(this.formData(), 'confirm');  
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(this.fbuser());  // reset the form
  }

  protected onFormDataChange(formData: FirebaseUserModel): void {
    this.formData.set(formData);
  }
}

import { Component, computed, inject, input, linkedSignal, signal } from "@angular/core";
import { IonContent, ModalController } from "@ionic/angular/standalone";

import { FirebaseUserModel, UserModel } from "@bk2/shared-models";
import { ChangeConfirmationComponent, HeaderComponent } from "@bk2/shared-ui";

import { FbuserFormComponent } from "@bk2/user-ui";
import { hasRole, removeUndefinedFields } from "@bk2/shared-util-core";

@Component({
  selector: 'bk-address-edit-modal',
  standalone: true,
  imports: [
    HeaderComponent, ChangeConfirmationComponent, FbuserFormComponent,
    IonContent
  ],
  template: `
    <bk-header title="@user.fbuser.edit.title" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [showCancel]=true (cancelClicked)="cancel()" (okClicked)="save()" />
      } 
    <ion-content>
      <bk-fbuser-form
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
export class FbuserEditModalComponent {
  private readonly modalController = inject(ModalController);

  // inputs
  public fbuser = input.required<FirebaseUserModel>();
  public currentUser = input.required<UserModel | undefined>();
  protected readonly readOnly = computed(() => !hasRole('admin', this.currentUser()));

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  public formData = linkedSignal(() => Object.assign(new FirebaseUserModel(), removeUndefinedFields(this.fbuser() as unknown as Record<string, unknown>)));

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

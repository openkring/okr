import { Component, computed, inject, input, linkedSignal, signal } from "@angular/core";
import { IonContent, ModalController } from "@ionic/angular/standalone";

import { FirebaseUserModel, UserModel } from "@bk2/shared-models";
import { ChangeConfirmationComponent, HeaderComponent } from "@bk2/shared-ui";

import { FbuserFormComponent } from "@bk2/user-ui";
import { hasRole } from "@bk2/shared-util-core";

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
        [currentUser]="currentUser()"
        [readOnly]="readOnly()"
          (formDataChange)="onFormDataChange($event)"
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
  public formData = linkedSignal(() => this.fbuser()); 

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

import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { OwnershipModel, RoleName, UserModel } from '@bk2/shared-models';
import { ChangeConfirmationComponent, HeaderComponent } from '@bk2/shared-ui';
import { hasRole, safeStructuredClone } from '@bk2/shared-util-core';

import { OwnershipNewFormComponent } from './ownership-new.form';

@Component({
  selector: 'bk-ownership-new-modal',
  standalone: true,
  imports: [
    HeaderComponent, OwnershipNewFormComponent,
    ChangeConfirmationComponent,
    IonContent
  ],
  template: `
    <bk-header title="@ownership.operation.create.label" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [showCancel]=true (cancelClicked)="cancel()" (okClicked)="save()" />
    }
    <ion-content>
      @if(formData(); as formData) {
        <bk-ownership-new-form
          [formData]="formData"
          (formDataChange)="onFormDataChange($event)"
          [currentUser]="currentUser()"
          [readOnly]="readOnly()"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />
      }
    </ion-content>
  `
})
export class OwnershipNewModalComponent {
  private readonly modalController = inject(ModalController);

  // inputs
  public ownership = input.required<OwnershipModel>();
  public currentUser = input<UserModel | undefined>();

   // signals
  protected formDirty = signal(false);
  protected formValid = signal(true);   // default to true as the form is prefilled
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected formData = linkedSignal(() => safeStructuredClone(this.ownership()));
  protected showForm = signal(true);

  // derived signals
  protected readOnly = computed(() => !hasRole('resourceAdmin', this.currentUser()));

 /******************************* actions *************************************** */
  public async save(): Promise<void> {
    await this.modalController.dismiss(this.formData(), 'confirm');
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(safeStructuredClone(this.ownership()));  // reset the form
    // This destroys and recreates the <form scVestForm> → Vest fully resets
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }

  protected onFormDataChange(formData: OwnershipModel): void {
    this.formData.set(formData);
  }

  protected hasRole(role: RoleName | undefined): boolean {
    return hasRole(role, this.currentUser());
  }
}

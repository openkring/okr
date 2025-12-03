import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { AppStore } from '@bk2/shared-feature';
import { TranslatePipe } from '@bk2/shared-i18n';
import { OrgModel, PersonModel, ResourceModel, RoleName, TransferModel } from '@bk2/shared-models';
import { ChangeConfirmationComponent, HeaderComponent } from '@bk2/shared-ui';
import { hasRole } from '@bk2/shared-util-core';

import { convertFormToTransfer, newTransferFormModel, TransferFormModel } from '@bk2/relationship-transfer-util';

import { TransferFormComponent } from './transfer.form';

@Component({
  selector: 'bk-transfer-new-modal',
  standalone: true,
  imports: [
    HeaderComponent, ChangeConfirmationComponent, TransferFormComponent,
    TranslatePipe, AsyncPipe,
    IonContent
  ],
  template: `
    <bk-header title="{{ '@transfer.operation.create.label' | translate | async }}" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [showCancel]=true (cancelClicked)="cancel()" (okClicked)="save()" />
    }
    <ion-content>
      <bk-transfer-form
        [formData]="formData()"
        [readOnly]="readOnly()"
        (formDataChange)="onFormDataChange($event)"
      />
    </ion-content>
  `
})
export class TransferNewModalComponent {
  private readonly modalController = inject(ModalController);
  protected readonly appStore = inject(AppStore);

  // inputs
  public subject = input.required<PersonModel | OrgModel>();
  public subjectModelType = input.required<'person' | 'org'>();
  public object = input.required<PersonModel | OrgModel>();
  public objectModelType = input.required<'person' | 'org'>();
  public resource = input.required<ResourceModel>();

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(true); // new form is prefilled and valid
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected formData = linkedSignal(() => newTransferFormModel(this.subject(), this.subjectModelType(), this.object(), this.objectModelType(), this.resource()));

  // derived signals
  private currentUser = computed(() => this.appStore.currentUser());
  protected readOnly = computed(() => !hasRole('resourceAdmin', this.currentUser()));

 /******************************* actions *************************************** */
  public async save(): Promise<void> {
    this.formDirty.set(false);
    await this.modalController.dismiss(convertFormToTransfer(this.formData(), new TransferModel(this.appStore.tenantId())), 'confirm');
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(newTransferFormModel(this.subject(), this.subjectModelType(), this.object(), this.objectModelType(), this.resource()));  // reset the form
  }

  protected onFormDataChange(formData: TransferFormModel): void {
    this.formData.set(formData);
  }

  /******************************* helpers *************************************** */
  protected hasRole(role?: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}

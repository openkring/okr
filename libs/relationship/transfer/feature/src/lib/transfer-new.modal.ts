import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';
import { AsyncPipe } from '@angular/common';

import { ChangeConfirmationComponent, HeaderComponent } from '@bk2/shared/ui';
import { TranslatePipe } from '@bk2/shared/i18n';
import { RoleName } from '@bk2/shared/config';
import { ModelType, OrgModel, PersonModel, ResourceModel } from '@bk2/shared/models';
import { hasRole } from '@bk2/shared/util';

import { AppStore } from '@bk2/auth/feature';

import { convertFormToTransfer, newTransferFormModel } from '@bk2/transfer/util';
import { TransferFormComponent } from './transfer.form';

@Component({
  selector: 'bk-transfer-new-modal',
  imports: [
    HeaderComponent, ChangeConfirmationComponent, TransferFormComponent,
    TranslatePipe, AsyncPipe,
    IonContent
  ],
  template: `
    <bk-header title="{{ '@transfer.operation.create.label' | translate | async }}" [isModal]="true" />
    @if(formIsValid()) {
      <bk-change-confirmation (okClicked)="save()" />
    }
    <ion-content>
      <bk-transfer-form [(vm)]="vm" [currentUser]="appStore.currentUser()" [transferTags]="transferTags()" (validChange)="formIsValid.set($event)" />
    </ion-content>
  `
})
export class TransferNewModalComponent {
  private readonly modalController = inject(ModalController);
  protected readonly appStore = inject(AppStore);

  public subject = input.required<PersonModel | OrgModel>();
  public subjectModelType = input.required<ModelType>();
  public object = input.required<PersonModel | OrgModel>();
  public objectModelType = input.required<ModelType>();
  public resource = input.required<ResourceModel>();

  public vm = linkedSignal(() => newTransferFormModel(this.subject(), this.subjectModelType(), this.object(), this.objectModelType(), this.resource()));
  protected transferTags = computed(() => this.appStore.getTags(ModelType.Transfer));

  // as we prepared everything with currentPerson and defaultResource, we already have a valid form, so we need to signal this here.
  protected formIsValid = signal(true);

  public save(): Promise<boolean> {
    return this.modalController.dismiss(convertFormToTransfer(undefined, this.vm(), this.appStore.tenantId()), 'confirm');
  }

  protected hasRole(role?: RoleName): boolean {
    return hasRole(role, this.appStore.currentUser());
  }
}

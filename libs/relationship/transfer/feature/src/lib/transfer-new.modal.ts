import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { AppStore } from '@bk2/shared-feature';
import { TranslatePipe } from '@bk2/shared-i18n';
import { OrgModel, PersonModel, ResourceModel, RoleName } from '@bk2/shared-models';
import { ChangeConfirmationComponent, HeaderComponent } from '@bk2/shared-ui';
import { hasRole } from '@bk2/shared-util-core';

import { convertFormToTransfer, newTransferFormModel } from '@bk2/relationship-transfer-util';

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
    @if(formIsValid()) {
      <bk-change-confirmation (okClicked)="save()" />
    }
    <ion-content>
      <bk-transfer-form [(vm)]="vm" (validChange)="formIsValid.set($event)" />
    </ion-content>
  `
})
export class TransferNewModalComponent {
  private readonly modalController = inject(ModalController);
  protected readonly appStore = inject(AppStore);

  public subject = input.required<PersonModel | OrgModel>();
  public subjectModelType = input.required<'person' | 'org'>();
  public object = input.required<PersonModel | OrgModel>();
  public objectModelType = input.required<'person' | 'org'>();
  public resource = input.required<ResourceModel>();

  public vm = linkedSignal(() => newTransferFormModel(this.subject(), this.subjectModelType(), this.object(), this.objectModelType(), this.resource()));

  // as we prepared everything with currentPerson and defaultResource, we already have a valid form, so we need to signal this here.
  protected formIsValid = signal(true);

  public save(): Promise<boolean> {
    return this.modalController.dismiss(convertFormToTransfer(undefined, this.vm(), this.appStore.tenantId()), 'confirm');
  }

  protected hasRole(role?: RoleName): boolean {
    return hasRole(role, this.appStore.currentUser());
  }
}

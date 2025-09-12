import { inject, Injectable } from "@angular/core";
import { ModalController } from "@ionic/angular/standalone";

import { AppStore } from "@bk2/shared-feature";
import { ModelType, OrgModel, PersonModel, ResourceModel, TransferModel } from "@bk2/shared-models";

import { TransferService } from "@bk2/relationship-transfer-data-access";
import { isTransfer } from "@bk2/relationship-transfer-util";

import { TransferEditModalComponent } from "./transfer-edit.modal";
import { TransferNewModalComponent } from "./transfer-new.modal";


@Injectable({
    providedIn: 'root'
})
export class TransferModalsService {
  private readonly modalController = inject(ModalController);
  private readonly appStore = inject(AppStore);
  private readonly transferService = inject(TransferService);
  
  private readonly tenantId = this.appStore.tenantId();
  
 /**
   * Show a modal to add a new transfer relationship.
   * @param subject person or org
   * @param modelType the type of the subject (Person or Org)
   * @param object person or org
   * @param modelType the type of the object (Person or Org)
   * @param resource the resource object that is transferred
   */
   public async add(subject: PersonModel | OrgModel, subjectModelType: ModelType, object: PersonModel | OrgModel, objectModelType: ModelType, resource: ResourceModel): Promise<void> {
    const _modal = await this.modalController.create({
      component: TransferNewModalComponent,
      cssClass: 'small-modal',
      componentProps: {
        subject: subject,
        subjectModelType: subjectModelType,
        object: object,
        objectModelType: objectModelType,
        resource: resource
      }
    });
    _modal.present();
    const { data, role } = await _modal.onDidDismiss();
    if (role === 'confirm') {
      if (isTransfer(data, this.tenantId)) {
        await this.transferService.create(data, this.appStore.currentUser());
      }
    }
  }

  /**
   * Show a modal to edit an existing transfer relationship.
   * @param transfer the transfer relationship to edit
   */
  public async edit(transfer?: TransferModel): Promise<void> {
    transfer ??= new TransferModel(this.tenantId);
    
    const _modal = await this.modalController.create({
      component: TransferEditModalComponent,
      componentProps: {
        transfer: transfer
      }
    });
    _modal.present();
    const { data, role } = await _modal.onDidDismiss();
    if (role === 'confirm') {
      if (isTransfer(data, this.tenantId)) {
        await (!data.bkey ? 
          this.transferService.create(data, this.appStore.currentUser()) : 
          this.transferService.update(data, this.appStore.currentUser()));
      }
    }
  }
}
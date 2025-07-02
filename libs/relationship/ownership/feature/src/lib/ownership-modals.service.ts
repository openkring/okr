import { inject, Injectable } from "@angular/core";
import { ModalController } from "@ionic/angular/standalone";

import { AppStore } from "@bk2/shared/feature";
import { ModelType, OrgModel, OwnershipModel, PersonModel, ResourceModel } from "@bk2/shared/models";

import { OwnershipService } from "@bk2/ownership/data-access";
import { convertFormToOwnership, isOwnership, OwnershipNewFormModel } from "@bk2/ownership/util";
import { OwnershipNewModalComponent } from "./ownership-new.modal";
import { OwnershipEditModalComponent } from "./ownership-edit.modal";

@Injectable({
    providedIn: 'root'
})
export class OwnershipModalsService {
  private readonly modalController = inject(ModalController);
  private readonly appStore = inject(AppStore);
  private readonly ownershipService = inject(OwnershipService);
  
  private readonly tenantId = this.appStore.tenantId();

 /**
     * Show a modal to add a new ownership.
     * @param person or org to add as an owner
     * @param resource the owned resource
     * @param modelType the type of the member (Person or Org)
     */
  public async add(owner: PersonModel | OrgModel, modelType: ModelType, resource: ResourceModel): Promise<void> {
    const _modal = await this.modalController.create({
      component: OwnershipNewModalComponent,
      cssClass: 'small-modal',
      componentProps: {
        owner: owner,
        resource: resource,
        modelType: modelType,
      }
    });
    _modal.present();
    const { data, role } = await _modal.onDidDismiss();
    if (role === 'confirm') {
      const _ownership = convertFormToOwnership(undefined, data as OwnershipNewFormModel, this.tenantId);
      await this.ownershipService.create(_ownership, this.appStore.currentUser());
    }
  }  
  
  /**
   * Show a modal to edit an existing ownership.
   * @param ownership the ownership to edit
   */
  public async edit(ownership?: OwnershipModel): Promise<void> {
    let _ownership = ownership;
    _ownership ??= new OwnershipModel(this.tenantId);
    
    const _modal = await this.modalController.create({
      component: OwnershipEditModalComponent,
      componentProps: {
        ownership: _ownership,
        currentUser: this.appStore.currentUser()
      }
    });
    _modal.present();
    const { data, role } = await _modal.onDidDismiss();
    if (role === 'confirm') {
      if (isOwnership(data, this.tenantId)) {
        await (!data.bkey ? 
          this.ownershipService.create(data, this.appStore.currentUser()) : 
          this.ownershipService.update(data, this.appStore.currentUser()));
      }
    }  }
}
import { inject, Injectable } from "@angular/core";
import { ModalController } from "@ionic/angular/standalone";

import { AppStore } from "@bk2/shared-feature";
import { OrgModel, OwnershipModel, PersonModel, ResourceModel } from "@bk2/shared-models";

import { OwnershipService } from "@bk2/relationship-ownership-data-access";
import { isOwnership, newOwnership } from "@bk2/relationship-ownership-util";

import { OwnershipEditModalComponent } from "./ownership-edit.modal";
import { OwnershipNewModalComponent } from "./ownership-new.modal";

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
  public async add(owner: PersonModel | OrgModel, modelType: 'person' | 'org', resource: ResourceModel): Promise<void> {
    const ownership = newOwnership(owner, resource, this.appStore.tenantId(), modelType);
    const modal = await this.modalController.create({
      component: OwnershipNewModalComponent,
      cssClass: 'small-modal',
      componentProps: {
        ownership,
        currentUser: this.appStore.currentUser()
      }
    });
    modal.present();
    const { data, role } = await modal.onDidDismiss();
    if (role === 'confirm') {
      if (isOwnership(data, this.tenantId)) {
        await this.ownershipService.create(data, this.appStore.currentUser());
      }
    }
  }  
  
  /**
   * Show a modal to edit an existing ownership.
   * @param ownership the ownership to edit
   */
  public async edit(ownership?: OwnershipModel, readOnly = true): Promise<void> {
    ownership ??= new OwnershipModel(this.tenantId);
    
    const modal = await this.modalController.create({
      component: OwnershipEditModalComponent,
      componentProps: {
        ownership,
        currentUser: this.appStore.currentUser(),
        readOnly
      }
    });
    modal.present();
    const { data, role } = await modal.onDidDismiss();
    if (role === 'confirm') {
      if (isOwnership(data, this.tenantId)) {
        await (!data.bkey ? 
          this.ownershipService.create(data, this.appStore.currentUser()) : 
          this.ownershipService.update(data, this.appStore.currentUser()));
      }
    }  }
}
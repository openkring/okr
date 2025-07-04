import { inject, Injectable } from "@angular/core";
import { ModalController } from "@ionic/angular/standalone";

import { AppStore, PersonSelectModalComponent, ResourceSelectModalComponent } from "@bk2/shared/feature";
import { PersonModel, ResourceModel } from "@bk2/shared/models";
import { isPerson, isResource } from "@bk2/shared/util-core";

@Injectable({
    providedIn: 'root'
})
export class TransferSelectorsService {
  private readonly modalController = inject(ModalController);
  private readonly appStore = inject(AppStore);
  
  private readonly tenantId = this.appStore.tenantId();

  public async selectResource(): Promise<ResourceModel | undefined> {
    const _modal = await this.modalController.create({
      component: ResourceSelectModalComponent,
      cssClass: 'list-modal',
      componentProps: {
        selectedTag: '',
        currentUser: this.appStore.currentUser()
      }
    });
    _modal.present();
    const { data, role } = await _modal.onWillDismiss();
    if (role === 'confirm') {
      if (isResource(data, this.tenantId)) {
        return data;
      }
    }
    return undefined;
  }

  public async selectPerson(): Promise<PersonModel | undefined> {
    const _modal = await this.modalController.create({
      component: PersonSelectModalComponent,
      cssClass: 'list-modal',
      componentProps: {
        selectedTag: '',
        currentUser: this.appStore.currentUser()
      }
    });
    _modal.present();
    const { data, role } = await _modal.onWillDismiss();
    if (role === 'confirm') {
      if (isPerson(data, this.tenantId)) {
        return data;
      }
    }
    return undefined;
  }
}
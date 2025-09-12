import { inject, Injectable } from "@angular/core";
import { ModalController } from "@ionic/angular/standalone";

import { AppStore } from "@bk2/shared-feature";
import { Image } from "@bk2/shared-models";

import { ImageSelectModalComponent } from "./image-select.modal";

@Injectable({
    providedIn: 'root'
})
export class DocumentModalsService {
  private readonly modalController = inject(ModalController);
  private readonly appStore = inject(AppStore);

  /*-------------------------- UPLOAD -------------------------------*/
  public async pickAndUploadImage(key: string): Promise<Image | undefined> {
    const _modal = await this.modalController.create({
      component: ImageSelectModalComponent,
      cssClass: 'wide-modal',
      componentProps: {
        key: key,
        currentUser: this.appStore.currentUser()
      }
    });
    _modal.present();

    const { data, role } = await _modal.onWillDismiss();
    if(role === 'confirm') {
      return data as Image;
    }
    return undefined;
  }
}

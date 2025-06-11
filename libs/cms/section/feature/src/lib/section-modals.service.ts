import { inject, Injectable } from "@angular/core";
import { ModalController } from "@ionic/angular/standalone";

import { Image } from "@bk2/shared/models";
import { ImageEditModalComponent } from "./image-edit.modal";

@Injectable({
    providedIn: 'root'
})
export class SectionModalsService {
  private readonly modalController = inject(ModalController);

  public async editImage(imageDesc: Image): Promise<Image | undefined> {
    const _modal = await this.modalController.create({
      component: ImageEditModalComponent,
      cssClass: 'wide-modal',
      componentProps: {
        imageDesc: imageDesc
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

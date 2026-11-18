import { inject, Injectable } from '@angular/core';
import { ModalController } from '@ionic/angular';

import { ImageStyle } from '@okr/shared-models';
import { error, UploadEntry, UploadPresenter } from '@okr/shared-util-angular';

import { showZoomedImage } from './ui.util';
import { UploadTaskModal } from './upload-task.modal';

/**
 * The shared-ui side of UPLOAD_PRESENTER: UploadService (avatar data-access) runs its uploads and
 * zoomed views through this, bound in every app by `provideModelSelector()`.
 */
@Injectable({ providedIn: 'root' })
export class UploadPresenterService implements UploadPresenter {
  private readonly modalController = inject(ModalController);

  public async runUploads(uploads: UploadEntry[], title: string): Promise<(string | undefined)[] | undefined> {
    const modal = await this.modalController.create({
      component: UploadTaskModal,
      componentProps: { uploads, title }
    });
    modal.present();
    try {
      const { data, role } = await modal.onWillDismiss();
      if (role === 'confirm') {
        return data as (string | undefined)[];
      }
    } catch (ex) {
      error(undefined, 'UploadPresenterService.runUploads -> ERROR: ' + JSON.stringify(ex));
    }
    return undefined;
  }

  public async showZoomedImage(url: string, title: string, style: ImageStyle, altText: string, cssClass: string): Promise<void> {
    await showZoomedImage(this.modalController, url, title, style, altText, cssClass);
  }
}

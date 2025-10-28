import { inject, Injectable } from "@angular/core";
import { Camera, CameraResultType, CameraSource, Photo } from "@capacitor/camera";
import { FilePicker } from "@capawesome/capacitor-file-picker";
import { ModalController } from "@ionic/angular/standalone";

import { Dimensions, Image } from "@bk2/shared-models";
import { error } from "@bk2/shared-util-angular";
import { warn } from "@bk2/shared-util-core";

import { showZoomedImage } from "./ui.util";
import { UploadTaskComponent } from "./upload-task.modal";

@Injectable({
    providedIn: 'root'
})
export class UploadService {
  private readonly modalController = inject(ModalController);

  /**
   * Upload a file into Firestorage and return the download URL.
   * @param file the file to upload
   * @param fullPath the full path where the file should be uploaded, e.g. 'orgs/1234/images/profile.jpg'
   * @param title the title of the upload task, e.g. 'Upload Profile Image'
   * @returns the download URL of the uploaded image
   */
  public async uploadFile(file: File, fullPath: string, title: string): Promise<string | undefined> {
    const modal = await this.modalController.create({
      component: UploadTaskComponent,
      cssClass: 'upload-modal',
      componentProps: {
        file: file,
        fullPath: fullPath,
        title: title
      }
    });
    modal.present();
    try {
      const { data, role } = await modal.onWillDismiss();    // data contains the Firestorage download URL
      if (role === 'confirm') {
        return data as string;    // return the firebase storage download URL
      }
    }
    catch (ex) {
      error(undefined, 'UploadService.uploadFile -> ERROR: ' + JSON.stringify(ex));
    }
    return undefined;
  }

  /**
   * Shows a file dialog and lets the user choose a file from the local file system.
   * @param mimeTypes a list of mime types to filter the file dialog (e.g. ['image/png', 'image/jpg', 'application/pdf'])
   * @returns the selected file or undefined if the file dialog was cancelled
   */
  public async pickFile(mimeTypes: string[]): Promise<File | undefined> {
    const result = await FilePicker.pickFiles({
      types: mimeTypes
    });
    if (result.files.length !== 1) {
      warn('UploadService.pickFile: expected 1 file, got ' + result.files.length);
      return undefined;
    }
    const blob = result.files[0].blob;
    if (!blob) {
      warn('UploadService.pickFile: blob is mandatory.');
      return undefined;
    }
    const file = new File([blob], result.files[0].name, {
      type: result.files[0].mimeType
    });
    return file;
  }

  /**
   * Take a photo using the device camera.
   * @returns a Photo object containing the image taken by the camera
   */
   public async takePhoto(): Promise<Photo> {
    return await Camera.getPhoto({
      resultType: CameraResultType.Uri,
      source: CameraSource.Camera,
      quality: 100
    });
  }

  public async showZoomedImage(image: Image, title = '@content.type.article.zoomedImage', cssClass = 'zoom-modal'): Promise<void> {
    await showZoomedImage(this.modalController, title, image, cssClass);     
  }
}
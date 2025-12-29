import { inject, Injectable } from "@angular/core";
import { Camera, CameraResultType, CameraSource, Photo } from "@capacitor/camera";
import { FilePicker } from "@capawesome/capacitor-file-picker";
import { ModalController } from "@ionic/angular/standalone";

import { DocumentModel, DocumentModelName, IMAGE_STYLE_SHAPE } from "@bk2/shared-models";
import { error } from "@bk2/shared-util-angular";
import { getFileHash, getTodayStr, warn } from "@bk2/shared-util-core";
import { DEFAULT_MIMETYPES } from "@bk2/shared-constants";
import { UploadTaskComponent, showZoomedImage } from "@bk2/shared-ui";

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
   * Add a new document:
   * 1) Let's the user pick a document from the local file system
   * 2) upload the file into Firestorage in tenant/[tenantId]/document/[hash]
   * 3) generates an initial document object in the database with attributes derived from the file
   * 4) return the an initial document model (including the hash as bkey and the download URL)
   * The idea is that the calling function then navigates to the document details page so that the user can add additional metadata.
   * @param mimeTypes 
   * @param storagePath 
   * @param title 
   */
  public async uploadAndCreateDocument(tenantId: string, mimeTypes = DEFAULT_MIMETYPES, storagePath?: string, modalTitle?: string): Promise<DocumentModel | undefined> {
    // 1) pick file
    const file = await this.pickFile(mimeTypes);
    if (!file) return undefined;

    // 2) upload the file into storage - only if it not already exists - if it has the same hash, Firebase Storage ignores the duplicate 
    const hash = await getFileHash(file);
    const path = storagePath ? storagePath : `tenant/${tenantId}/${DocumentModelName}/${hash}`;
    const title = modalTitle ? modalTitle : `Uploading ${file.name}`;
    const downloadUrl = await this.uploadFile(file, path, title);
    if ( !downloadUrl ) return undefined;

    // 3) create a new document object
    const document = new DocumentModel(tenantId);
    document.bkey = hash;
    document.title = file.name;
    document.altText = file.name;
    document.fullPath = path + '/' + file.name;
    document.mimeType = file.type;
    document.size = file.size;
    document.source = 'storage';
    document.url = downloadUrl;
    const now = getTodayStr();
    document.dateOfDocCreation = now;
    document.dateOfDocLastUpdate = now;
    document.hash = hash;
    document.version = now;
    // 4) return the document object
    return document;
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

  public async showZoomedImage(url: string, title = '@content.type.article.zoomedImage', style = IMAGE_STYLE_SHAPE, altText = '', cssClass = 'zoom-modal'): Promise<void> {
    await showZoomedImage(this.modalController, url, title, style, altText, cssClass);     
  }
}
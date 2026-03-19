import { inject, Injectable } from "@angular/core";
import { Camera, CameraResultType, CameraSource, Photo } from "@capacitor/camera";
import { Capacitor } from "@capacitor/core";
import { FilePicker } from "@capawesome/capacitor-file-picker";
import { ModalController } from "@ionic/angular/standalone";

import { DocumentModel, DocumentModelName, IMAGE_STYLE_SHAPE, UserModel } from "@bk2/shared-models";
import { error } from "@bk2/shared-util-angular";
import { warn } from "@bk2/shared-util-core";
import { buildDocumentModel } from "@bk2/document-util";
import { DocumentService } from "@bk2/document-data-access";
import { DEFAULT_MIMETYPES } from "@bk2/shared-constants";
import { UploadEntry, UploadTaskComponent, showZoomedImage } from "@bk2/shared-ui";

@Injectable({
    providedIn: 'root'
})
export class UploadService {
  private readonly modalController = inject(ModalController);
  private readonly documentService = inject(DocumentService);

  /**
   * Upload a file into Firestorage and return the download URL.
   * @param file the file to upload
   * @param fullPath the full path where the file should be uploaded, e.g. 'orgs/1234/images/profile.jpg'
   * @param title the title of the upload task, e.g. 'Upload Profile Image'
   * @returns the download URL of the uploaded image
   */
  public async uploadFile(file: File, fullPath: string, title: string): Promise<string | undefined> {
    const urls = await this.uploadFiles([{ file, fullPath }], title);
    return urls?.[0];
  }

  /**
   * Upload multiple files into Firebase Storage and return their download URLs.
   * @param uploads array of { file, fullPath } pairs
   * @param title the title of the upload modal
   * @returns array of download URLs (undefined entries for failed uploads)
   */
  public async uploadFiles(uploads: UploadEntry[], title: string): Promise<(string | undefined)[] | undefined> {
    const modal = await this.modalController.create({
      component: UploadTaskComponent,
      cssClass: 'upload-modal',
      componentProps: { uploads, title }
    });
    modal.present();
    try {
      const { data, role } = await modal.onWillDismiss();
      if (role === 'confirm') {
        return data as (string | undefined)[];
      }
    } catch (ex) {
      error(undefined, 'UploadService.uploadFiles -> ERROR: ' + JSON.stringify(ex));
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
      types: mimeTypes,
      limit: 1,
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
    return new File([blob], result.files[0].name, { type: result.files[0].mimeType });
  }

  /**
   * Open a file picker allowing multiple file selection and return the selected files.
   * @param mimeTypes a list of mime types to filter the file dialog
   * @returns the selected files (empty array if cancelled or no blobs available)
   */
  public async pickMultipleFiles(mimeTypes: string[]): Promise<File[]> {
    const result = await FilePicker.pickFiles({ types: mimeTypes });
    return result.files
      .filter(f => !!f.blob)
      .map(f => new File([f.blob!], f.name, { type: f.mimeType }));
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
    const file = await this.pickFile(mimeTypes);
    if (!file) return undefined;

    const path = storagePath ?? `tenant/${tenantId}/${DocumentModelName}`;
    const title = modalTitle ?? `Uploading ${file.name}`;
    const downloadUrl = await this.uploadFile(file, `${path}/${file.name}`, title);
    if (!downloadUrl) return undefined;

    return buildDocumentModel(file, tenantId, `${path}/${file.name}`, downloadUrl);
  }

  /**
   * Build a DocumentModel from a just-uploaded file and persist it to Firestore.
   * @param file the uploaded file
   * @param tenantId the tenant the document belongs to
   * @param storagePath the full storage path of the uploaded file
   * @param downloadUrl the download URL returned by Firebase Storage
   * @param currentUser optional author
   * @returns the Firestore document key of the created document
   */
  public async createAndSaveDocument(file: File, tenantId: string, storagePath: string, downloadUrl: string, currentUser?: UserModel): Promise<string | undefined> {
    const document = await buildDocumentModel(file, tenantId, storagePath, downloadUrl, currentUser);
    return this.documentService.create(document, currentUser);
  }

  /**
   * Take a photo using the device camera.
   * @returns a Photo object containing the image taken by the camera
   */
   public async takePhoto(): Promise<Photo> {
    return await Camera.getPhoto({
      resultType: CameraResultType.Uri,
      source: Capacitor.isNativePlatform() ? CameraSource.Prompt : CameraSource.Photos,
      quality: 100
    });
  }

  public async showZoomedImage(url: string, title = '@content.type.article.zoomedImage', style = IMAGE_STYLE_SHAPE, altText = '', cssClass = 'zoom-modal'): Promise<void> {
    await showZoomedImage(this.modalController, url, title, style, altText, cssClass);     
  }
}
import { inject, Injectable } from "@angular/core";
import { getDocumentStoragePath } from "@bk2/document/util";
import { ENV } from "@bk2/shared/config";
import { ModelType } from "@bk2/shared/models";
import { UploadTaskComponent } from "@bk2/shared/ui";
import { warn } from "@bk2/shared/util";
import { FilePicker } from "@capawesome/capacitor-file-picker";
import { ModalController } from "@ionic/angular/standalone";


@Injectable({
  providedIn: 'root'
})
export class DocumentUploadService {
  private readonly modalController = inject(ModalController);
  private readonly env = inject(ENV);

  /**
   * Shows as a file dialog and lets the user choose file from the local file system.
   * @param mimeTypes a list of mime types to filter the file dialog (e.g. ['image/png', 'image/jpg', 'application/pdf'])
   * @returns the selected file or undefined if the file dialog was cancelled
   */
  public async pickFile(mimeTypes: string[]): Promise<File | undefined> {
    const _result = await FilePicker.pickFiles({
      types: mimeTypes
    });
    if (_result.files.length !== 1) {
      warn('document.util.pickFile: expected 1 file, got ' + _result.files.length);
      return undefined;
    }
    const _blob = _result.files[0].blob;
    if (!_blob) {
      warn('document.util.pickFile: blob is mandatory.');
      return undefined;
    }
    const _file = new File([_blob], _result.files[0].name, {
      type: _result.files[0].mimeType
    });
    return _file;
  }

  /**
   * Uploads a file to the storage location and shows a progress bar.
   * @param file the document to upload
   * @param storageLocation an URL to the storage location, i.e. the folder where the file should be stored
   * @returns the full path of the uploaded file or undefined if the upload was cancelled
   */
  public async uploadFile(file: File, storageLocation: string): Promise<string | undefined> {
    console.log('uploadFile: file =', file, 'storageLocation =', storageLocation, 'fullPath =', storageLocation + '/' + file.name);
    const _modal = await this.modalController.create({
      component: UploadTaskComponent,
      cssClass: 'upload-modal',
      componentProps: {
        file: file,
        fullPath: storageLocation + '/' + file.name,
        title: '@document.operation.upload.single.title'
      }
    });
    _modal.present();

    const { role } = await _modal.onWillDismiss();
    return ( role === 'confirm') ? storageLocation + '/' + file.name : undefined;
  }

  /**
   * Uploads a file to a specific model.
   * @param modalController the modal controller to show the upload progress
   * @param tenantId the tenant of the model
   * @param file the file to upload
   * @param modelType the type of the model to which the file belongs
   * @param key the key of the model to which the file belongs
   * @returns the full path of the uploaded file or undefined if the upload was cancelled
   */
  public async uploadFileToModel(file: File, modelType: ModelType, key: string): Promise<string | undefined> {
    if (key) {
      const _storageLocation = getDocumentStoragePath(this.env.owner.tenantId, modelType, key);
      return _storageLocation ? await this.uploadFile(file, _storageLocation) : undefined;
    }
    return undefined;
  }
}
import { Injectable, inject } from "@angular/core";
import { doc, setDoc } from "firebase/firestore";
import { Observable, of } from "rxjs";
import { Camera, CameraResultType, CameraSource, Photo } from "@capacitor/camera";
import { ModalController, Platform } from "@ionic/angular/standalone";

import { removeKeyFromBkModel } from "@bk2/shared/util";
import { ENV, FIRESTORE } from "@bk2/shared/config";
import { UploadTaskComponent } from "@bk2/shared/ui";
import { AvatarCollection, AvatarModel, ModelType } from "@bk2/shared/models";
import { readModel } from "@bk2/shared/data-access";

import { newAvatarModel, readAsFile } from "@bk2/avatar/util";

export interface UserPhoto {
  filepath: string;
  webviewPath?: string;
}

@Injectable({
  providedIn: 'root'
})
export class AvatarService {
  private readonly modalController = inject(ModalController);
  private readonly platform = inject(Platform);
  private readonly firestore = inject(FIRESTORE);
  private readonly env = inject(ENV);

  public photos: UserPhoto[] = [];

/**
 * Save a model as a new Firestore document into the database. 
 * We use a combination of the modelType and mkey as the document ID.
 * This function uses setdoc() to overwrite a document with the same ID. If the document does not exist, it will be created.
 * If the document does exist, its contents will be overwritten with the newly provided data.
 * @param model the avatar data to save
 * @returns a Promise of the key of the newly stored model
 */
  public async updateOrCreate(avatar: AvatarModel): Promise<string> {
    // we delete the bkey from the model because we don't want to store it in the database (_ref.id is available instead)
    const _storedModel = removeKeyFromBkModel(avatar);
    
    const _ref = doc(this.firestore, AvatarCollection, `${avatar.bkey}`);
    try {
      // we need to convert the custom object to a pure JavaScript object (e.g. arrays)
      await setDoc(_ref, JSON.parse(JSON.stringify(_storedModel)));
      return Promise.resolve(_ref.id);
    }
    catch (_ex) {
      console.error(`AvatarService.updateOrCreate -> ERROR on path=${AvatarCollection}/${_ref.id}:`, _ex);
      return Promise.reject(new Error('Failed to create model'));
    }
  }

    // key  =  ModelType.ModelKey, e.g. 15.1123123asdf
  public read(key: string): Observable<AvatarModel | undefined> {
    if (!key || key.length === 0) return of(undefined);
    return readModel<AvatarModel>(this.firestore, AvatarCollection, key);
  }

  /**
   * Uploads an image to Firebase storage and saves it as an avatar model in the database.
   * @param photo the avatar photo that is uploaded to and stored in the firebase storage
   * @param modelType the type of the model that the avatar belongs to
   * @param key the key of the model that the avatar belongs to
   * @param tenants the tenant that should be able to access the avatar, typically the tenants of the model
   */
  public async uploadPhoto(photo: Photo, modelType: ModelType, key: string, tenants?: string[]): Promise<void> {
    const _file = await readAsFile(photo, this.platform);

    if (key) {
      const _avatar = newAvatarModel(tenants ?? [this.env.owner.tenantId], modelType, key, _file.name)
      const _modal = await this.modalController.create({
        component: UploadTaskComponent,
        cssClass: 'upload-modal',
        componentProps: {
          file: _file,
          fullPath: _avatar.storagePath,
          title: '@document.operation.upload.avatar.title'
        }
      });
      _modal.present();

      const { role } = await _modal.onWillDismiss();

      if (role === 'confirm') {
        await this.updateOrCreate(_avatar);
      }
    }
  }

  public async takePhoto(): Promise<Photo> {
    return await Camera.getPhoto({
      resultType: CameraResultType.Uri,
      source: CameraSource.Camera,
      quality: 100
    });
  }
}
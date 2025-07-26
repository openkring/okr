import { Injectable, inject } from "@angular/core";
import { map, Observable, of } from "rxjs";

import { AvatarCollection, AvatarModel, ModelType, ResourceType } from "@bk2/shared/models";
import { FirestoreService } from "@bk2/shared/data-access";
import { addImgixParams, getModelAndKey } from "@bk2/shared/util-core";
import { ENV } from "@bk2/shared/config";
import { THUMBNAIL_SIZE } from "@bk2/shared/constants";
import { getCategoryIcon, ModelTypes, ResourceTypes, RowingBoatTypes } from "@bk2/shared/categories";

export interface UserPhoto {
  filepath: string;
  webviewPath?: string;
}

@Injectable({
  providedIn: 'root'
})
export class AvatarService {
  private readonly firestoreService = inject(FirestoreService);
  private readonly env = inject(ENV);

  /**
   * Save a model as a new Firestore document into the database. 
   * We use a combination of the modelType and mkey as the document ID.
   * @param model the avatar data to save
   * @returns a Promise of the key of the newly stored model or undefined if the operation failed
   */
  public async updateOrCreate(avatar: AvatarModel): Promise<string | undefined> {
    return await this.firestoreService.updateModel<AvatarModel>(AvatarCollection, avatar, true);
  }

  /**
   * Read an avatar model from Firestore by its key.
   * @param key the key of the avatar in the format ModelType.ModelKey e.g. 15.1123123asdf
   * @returns an Observable of the avatar model or undefined if not found
   */
  public read(key: string): Observable<AvatarModel | undefined> {
    if (!key || key.length === 0) return of(undefined);
    return this.firestoreService.readModel<AvatarModel>(AvatarCollection, key);
  }

  /**
   * Get the imgix URL for an avatar by its key.
   * @param key the key of the avatar in the format ModelType.ModelKey e.g. 15.1123123asdf
   * @param size the optional size of the image to retrieve; default is THUMBNAIL_SIZE
   * @param imgixBaseUrl the optional base URL for imgix, defaults to the configured value
   * @param expandImgixBaseUrl whether to expand the imgix base URL with parameters, defaults to true
   * @returns an Observable of the imgix (absolute) URL for the avatar or the default icon if no avatar is found
   */
  public getAvatarImgixUrl(key: string, size = THUMBNAIL_SIZE, imgixBaseUrl = this.env.services.imgixBaseUrl, expandImgixBaseUrl=true): Observable<string> {
    const [_modelType, _key] = getModelAndKey(key);
    const _path = AvatarCollection + '/' + _key;
    return this.firestoreService.readModel<AvatarModel>(_path, _key).pipe(
      map((_avatar) => {
        return this.getImgixUrl(_modelType, _key, imgixBaseUrl, size, _avatar as AvatarModel, expandImgixBaseUrl);
      })
    );
  }

  /**
   * Helper function to construct the imgix URL for an avatar.
   * @param modelType
   * @param key
   * @param imgixBaseUrl
   * @param size
   * @param avatar
   * @param expandImgixBaseUrl
   * @returns
   */
  public getImgixUrl(modelType: ModelType, key: string, imgixBaseUrl: string, size: number, avatar?: AvatarModel, expandImgixBaseUrl=true): string {
    if (!avatar) {
      const _iconName = this.getDefaultIcon(modelType, key);
      return `${imgixBaseUrl}/logo/icons/${_iconName}.svg`;
    } else {
      return expandImgixBaseUrl ? 
        `${imgixBaseUrl}/${addImgixParams(avatar.storagePath, size)}` :
        addImgixParams(avatar.storagePath, size);
    }
  }

  /**
   * This returns the name of the default icon for a given modelType.
   * For most modelTypes, this is the icon of the category of the modelType.
   * ModelType[.ResourceType[_SubType]]:key
   * For Resources, the given key consists of resourceType:key and the icon is derived from the resourceType, e.g. 20.0:key.
   * @param modelType 
   * @param key 
   * @returns 
   */
  public getDefaultIcon(modelType: ModelType, key: string): string {
    if (modelType === ModelType.Resource) {
      const _resourceTypePart = key.split(':')[0];
      if (_resourceTypePart.includes('_')) {
        const [_resTypePart, _subTypePart] = _resourceTypePart.split('_');
        if (parseInt(_resTypePart) === ResourceType.RowingBoat) {
          return getCategoryIcon(RowingBoatTypes, parseInt(_subTypePart));
        } else {
          return getCategoryIcon(ResourceTypes, parseInt(_resTypePart));
        }
      }
      return getCategoryIcon(ResourceTypes, parseInt(_resourceTypePart));
    } else {
      return getCategoryIcon(ModelTypes, modelType);
    }
  }
}
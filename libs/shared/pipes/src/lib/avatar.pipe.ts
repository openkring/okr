import { Pipe, PipeTransform, inject } from '@angular/core';
import { Firestore } from 'firebase/firestore';
import { map, Observable } from 'rxjs';

import { getCategoryIcon, ModelTypes, ResourceTypes, RowingBoatTypes } from '@bk2/shared/categories';
import { ENV, FIRESTORE, THUMBNAIL_SIZE } from "@bk2/shared/config";
import { AvatarCollection, AvatarModel, ModelType, ResourceType } from '@bk2/shared/models';
import { addImgixParams, getModelAndKey, readModel } from '@bk2/shared/util';

@Pipe({
  name: 'avatar',
})
export class AvatarPipe implements PipeTransform {
  private readonly firestore = inject(FIRESTORE);
  private readonly env = inject(ENV);

  transform(key: string): Observable<string> {
    return getAvatarImgixUrl(this.firestore, key, THUMBNAIL_SIZE, this.env.services.imgixBaseUrl);
  }
}

// key  =  modelType.modelKey, e.g. 15.1123123asdf
// this.returns an absolute imgix url (with the imgix base url). this is suitable for the img elements.
// if no Avatar information is found, it returns the default logo for the modelType.
export function getAvatarImgixUrl(firestore: Firestore, key: string, size: number, imgixBaseUrl: string, expandImgixBaseUrl=true): Observable<string> {
  const [_modelType, _key] = getModelAndKey(key);
  return readModel<AvatarModel>(firestore, AvatarCollection, key).pipe(map((_avatar) => {
    return getImgixUrl(_modelType, _key, imgixBaseUrl, size, _avatar, expandImgixBaseUrl);
  }))
}

export function getImgixUrl(modelType: ModelType, key: string, imgixBaseUrl: string, size: number, avatar?: AvatarModel, expandImgixBaseUrl=true): string {
  if (!avatar) {
    const _iconName = getDefaultIcon(modelType, key);
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
export function getDefaultIcon(modelType: ModelType, key: string): string {
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
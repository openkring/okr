import { Platform } from "@ionic/angular";
import { Photo } from "@capacitor/camera";
import { Filesystem } from "@capacitor/filesystem";

import { getModelSlug } from "@bk2/shared/categories";
import { blobToFile, die, getPartsOfTupel } from "@bk2/shared/util-core";
import { AvatarDirectory, AvatarModel, ModelType } from "@bk2/shared/models";

export function newAvatarModel(tenantIds: string[], modelType: ModelType, key: string, fileName: string): AvatarModel {
  const [_fn, _ext] = getPartsOfTupel(fileName);  
  const _slug = getModelSlug(modelType);
  return {
    bkey: modelType + '.' + key,
    tenants: tenantIds,
    storagePath: `tenant/${tenantIds[0]}/${_slug}/${key}/${AvatarDirectory}/${_fn}.${ _ext}`,
    isArchived: false
  };
}

  // https://ionicframework.com/docs/angular/your-first-app/3-saving-photos
export async function readAsFile(photo: Photo, platform: Platform): Promise<File> {
  if (platform.is('hybrid') && photo.path) {
    const _file = await Filesystem.readFile({
      path: photo.path
    });
    const _fileContent = _file.data;
    if (typeof(_fileContent) !== 'string') die('ProfilePage.readAsFile: _fileContent is not a string.');
    const _rawData = Buffer.from(_fileContent,'base64');
    return blobToFile(new Blob([new Uint8Array(_rawData)], {type: 'image/' + photo.format}), new Date().getTime() + '.' + photo.format);
  }
  else {
    // Fetch the photo, read as a blob, then convert to base64 format
    if (!photo.webPath) die('ProfilePage.readAsBase64: webPath is mandatory.');
    const _response = await fetch(photo.webPath);
    return blobToFile(await _response.blob(), new Date().getTime() + '.' + photo.format);
  }
}

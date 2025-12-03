import { Photo } from '@capacitor/camera';
import { Filesystem } from '@capacitor/filesystem';
import { Platform } from '@ionic/angular';

import { AvatarDirectory, AvatarModel } from '@bk2/shared-models';
import { blobToFile, die, getPartsOfTupel } from '@bk2/shared-util-core';

export function newAvatarModel(tenantIds: string[], modelType: string, key: string, fileName: string): AvatarModel {
  const [fn, ext] = getPartsOfTupel(fileName);
  return {
    bkey: modelType + '.' + key,
    tenants: tenantIds,
    storagePath: `tenant/${tenantIds[0]}/modelType/${key}/${AvatarDirectory}/${fn}.${ext}`,
    isArchived: false,
  };
}

// https://ionicframework.com/docs/angular/your-first-app/3-saving-photos
export async function readAsFile(photo: Photo, platform: Platform): Promise<File> {
  if (platform.is('hybrid') && photo.path) {
    const _file = await Filesystem.readFile({
      path: photo.path,
    });
    const _fileContent = _file.data;
    if (typeof _fileContent !== 'string') die('ProfilePage.readAsFile: _fileContent is not a string.');
    const _rawData = Buffer.from(_fileContent, 'base64');
    return blobToFile(new Blob([new Uint8Array(_rawData)], { type: 'image/' + photo.format }), new Date().getTime() + '.' + photo.format);
  } else {
    // Fetch the photo, read as a blob, then convert to base64 format
    if (!photo.webPath) die('ProfilePage.readAsBase64: webPath is mandatory.');
    const response = await fetch(photo.webPath);
    return blobToFile(await response.blob(), new Date().getTime() + '.' + photo.format);
  }
}

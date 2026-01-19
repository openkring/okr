import { Photo } from '@capacitor/camera';
import { Filesystem } from '@capacitor/filesystem';
import { Platform } from '@ionic/angular';

import { AvatarDirectory, AvatarModel, OrgModelName, PersonModelName } from '@bk2/shared-models';
import { blobToFile, die, getPartsOfTupel } from '@bk2/shared-util-core';

export function newAvatarModel(tenantIds: string[], modelType: string, key: string, fileName: string): AvatarModel {
  const [fn, ext] = getPartsOfTupel(fileName);
  return {
    bkey: modelType + '.' + key,
    tenants: tenantIds,
    storagePath: `tenant/${tenantIds[0]}/${modelType}/${key}/${AvatarDirectory}/${fn}.${ext}`,
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
    // Convert base64 string to Uint8Array using browser-compatible atob
    const binaryString = atob(_fileContent);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return blobToFile(new Blob([bytes], { type: 'image/' + photo.format }), new Date().getTime() + '.' + photo.format);
  } else {
    // Fetch the photo, read as a blob, then convert to base64 format
    if (!photo.webPath) die('ProfilePage.readAsBase64: webPath is mandatory.');
    const response = await fetch(photo.webPath);
    return blobToFile(await response.blob(), new Date().getTime() + '.' + photo.format);
  }
}

export function getDefaultIcon(modelType: string): string {
  switch (modelType) {
    case 'person':
      return PersonModelName;
    case 'org':
      return OrgModelName;
    case 'account':
      return 'bank_account';
    case 'resource': 
      return 'resource';
    default:
      return 'other';
  }
}
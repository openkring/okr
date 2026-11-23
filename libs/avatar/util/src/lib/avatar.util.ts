import { Photo } from '@capacitor/camera';
import { Filesystem } from '@capacitor/filesystem';
import { Platform } from '@ionic/angular/lazy';

import { AvatarDirectory, AvatarModel, OrgModelName, PersonModelName } from '@okr/shared-models';
import { blobToFile, die, getPartsOfTupel, isImage } from '@okr/shared-util-core';

/**
 * Builds the avatar doc id. It is tenant-scoped (`p13.person.kaiser`) because persons are
 * shared across tenants but their picture is not: each tenant may show its own.
 * A bare, un-prefixed id (`person.kaiser`) is the shared default, used by every tenant that
 * has no own avatar for that subject — see AvatarService.getAvatarUrl, which looks up the
 * tenant-scoped id first and falls back to the bare one.
 * @param tenantId the tenant the avatar belongs to
 * @param key the subject key in the form `<modelType>.<okey>`, e.g. person.kaiser
 */
export function avatarDocId(tenantId: string, key: string): string {
  return `${tenantId}.${key}`;
}

/**
 * The Storage directory that holds every avatar picture this tenant has uploaded for a subject.
 * @param key the subject key in the form `<modelType>.<okey>`, e.g. person.kaiser
 */
export function avatarStorageDir(tenantId: string, key: string): string {
  return `tenant/${tenantId}/${key.replace('.', '/')}/${AvatarDirectory}`;
}

/**
 * The pictures a subject can choose its avatar from: images only, the newest first (the file name is
 * the upload time in ms). The current picture is always part of it, also when it lives elsewhere
 * (the shared default may have been uploaded by another tenant).
 */
export function getAvatarChoices(paths: string[], currentPath = ''): string[] {
  const fileName = (path: string) => path.split('/').pop() ?? '';
  return [...new Set([...paths, currentPath])]
    .filter(path => path.length > 0 && isImage(path))
    .sort((a, b) => fileName(b).localeCompare(fileName(a), undefined, { numeric: true }));
}

export function newAvatarModel(tenantIds: string[], modelType: string, key: string, fileName: string): AvatarModel {
  const [fn, ext] = getPartsOfTupel(fileName);
  return {
    okey: avatarDocId(tenantIds[0], `${modelType}.${key}`),
    tenants: tenantIds,
    storagePath: `${avatarStorageDir(tenantIds[0], `${modelType}.${key}`)}/${fn}.${ext}`,
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
      return 'bank';
    case 'resource': 
      return 'resource';
    default:
      return 'other';
  }
}
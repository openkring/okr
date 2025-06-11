import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Platform } from '@ionic/angular/standalone';

import { getModelSlug } from '@bk2/shared/categories';
import { DOCUMENT_DIR, ModelType } from '@bk2/shared/models';
import { checkUrlType, warn } from '@bk2/shared/util';
import { readAsFile } from '@bk2/avatar/util';

/* ---------------------- Camera -------------------------*/
  /**
   * Select a photo from the camera or the photo library.
   * @returns the image taken or selected
   */
  export async function pickPhoto(platform: Platform): Promise<File | undefined> {
    const _photo = await Camera.getPhoto({
      quality: 90,
      allowEditing: false,
      resultType: CameraResultType.Uri,
      source: platform.is('mobile') ? CameraSource.Prompt : CameraSource.Photos 
    });
    return await readAsFile(_photo, platform);
  }

/* ---------------------- Helpers -------------------------*/
/**
 * Determine the title of a document based on a given operation.
 * @param operation 
 * @returns 
 */
export function getDocumentTitle(operation: string): string {
  return `document.operation.${operation}.label`;
}

export function checkMimeType(mimeType: string, imagesOnly = false): boolean {
  // images are always accepted
  if (mimeType.startsWith('image')) {
    return true;
  } // pdfs are accepted as normal documents
  if (imagesOnly === false && mimeType.startsWith('application/pdf')) {
    return true;
  }
  return false;
}

export function getDocumentStoragePath(tenant: string, modelType: ModelType, key?: string): string | undefined {
  if (modelType === undefined) {
    warn('document.util.getDocumentStoragePath -> modelType is undefined');
    return undefined;
  }
  if (key === undefined) {
    warn('document.util.getDocumentStoragePath -> key is undefined');
    return undefined;
  }
  if (tenant === undefined) {
    warn('document.util.getDocumentStoragePath -> tenant is undefined');
    return undefined;
  }
  const _slug = getModelSlug(modelType);
  return `${tenant}/${_slug}/${key}/${DOCUMENT_DIR}`;
}

/**
 * The given url is checked for its URL type and transformed into a path that can be used with imgix.
 * This path is of URLType storage, ie. a relative url to a file in the storage.
 * The file referenced by the url is mostly an image or a pdf, but it can be another file type.
 * The function either returns a relative storage path or undefined.
 * A URL of type 'key' is converted into a storage path (tenant/slug/key/DOCUMENT_DIR)
 * @param url the url as configured in the model
 * @param modelType the model type of the model
 * @param tenant the tenant of the model
 */
export function getStoragePath(url: string | undefined, modelType: ModelType, tenant: string): string | undefined {
  if (!url || url.length === 0) return undefined;
  const _urlType = checkUrlType(url);
  if (_urlType === 'storage') return url;
  if (_urlType === 'key') {
    return getDocumentStoragePath(tenant, modelType, url);
  }
  return undefined;
}


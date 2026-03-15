import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Platform } from '@ionic/angular/standalone';

import { DOCUMENT_DIR, DocumentModel, UserModel } from '@bk2/shared-models';
import { addIndexElement, checkUrlType, die, getFileHash, getFullName, getTodayStr, warn } from '@bk2/shared-util-core';

import { readAsFile } from '@bk2/avatar-util';


/* ---------------------- Camera -------------------------*/
/**
 * Select a photo from the camera or the photo library.
 * @returns the image taken or selected
 */
export async function pickPhoto(platform: Platform): Promise<File | undefined> {
  const photo = await Camera.getPhoto({
    quality: 90,
    allowEditing: false,
    resultType: CameraResultType.Uri,
    source: platform.is('mobile') ? CameraSource.Prompt : CameraSource.Photos,
  });
  return await readAsFile(photo, platform);
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

export function getDocumentStoragePath(tenant: string, modelType: string, key?: string): string | undefined {
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
  return `${tenant}/${modelType}/${key}/${DOCUMENT_DIR}`;
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
export function getStoragePath(url: string | undefined, modelType: string, tenant: string): string | undefined {
  if (!url || url.length === 0) return undefined;
  const urlType = checkUrlType(url);
  if (urlType === 'storage') return url;
  if (urlType === 'key') {
    return getDocumentStoragePath(tenant, modelType, url);
  }
  return undefined;
}

/*-------------------------- factory --------------------------------*/
/**
 * Build a DocumentModel from a file after it has been uploaded to Firebase Storage.
 * @param file the uploaded file
 * @param tenantId the tenant the document belongs to
 * @param storagePath the full storage path where the file was uploaded
 * @param downloadUrl the public download URL returned by Firebase Storage
 * @param currentUser optional user to set as author
 * @returns a populated DocumentModel ready to be saved to Firestore
 */
export async function buildDocumentModel(
  file: File,
  tenantId: string,
  storagePath: string,
  downloadUrl: string,
  currentUser?: UserModel,
): Promise<DocumentModel> {
  const hash = await getFileHash(file);
  const now = getTodayStr();
  const doc = new DocumentModel(tenantId);
  doc.bkey = hash;
  doc.hash = hash;
  doc.title = file.name;
  doc.altText = file.name;
  doc.fullPath = storagePath;
  doc.mimeType = file.type;
  doc.size = file.size;
  doc.source = 'storage';
  doc.url = downloadUrl;
  doc.authorKey = currentUser?.personKey ?? '';
  doc.authorName = getFullName(currentUser?.firstName, currentUser?.lastName);
  doc.dateOfDocCreation = now;
  doc.dateOfDocLastUpdate = now;
  doc.version = now;
  return doc;
}

/*-------------------------- search index --------------------------------*/
/**
 * Create an index entry for a given document based on its values.
 * @param document the document for which to create the index
 * @returns the index string
 */
export function getDocumentIndex(document: DocumentModel): string {
  let index = '';
  index = addIndexElement(index, 'n', document.title);
  index = addIndexElement(index, 'h', document.hash);
  index = addIndexElement(index, 'm', document.mimeType);
  index = addIndexElement(index, 'f', document.folderKeys.join(' '));
  return index;
}

/**
 * Returns a string explaining the structure of the index.
 * This can be used in info boxes on the GUI.
 */
export function getDocumentIndexInfo(): string {
  return 'n:filename h:ash m:imeType f:olderKeys';
}

import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Platform } from '@ionic/angular/standalone';

import { DOCUMENT_DIR, DocumentModel } from '@bk2/shared-models';
import { addIndexElement, checkUrlType, die, warn } from '@bk2/shared-util-core';

import { readAsFile } from '@bk2/avatar-util';
import { DocumentFormModel } from 'libs/document/util/src/lib/document-form.model';
import { DEFAULT_DATE, DEFAULT_DOCUMENT_SOURCE, DEFAULT_DOCUMENT_TYPE, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_TAGS, DEFAULT_TIME, DEFAULT_TITLE } from '@bk2/shared-constants';

/* ---------------------- Form Conversions -------------------------*/
export function convertDocumentToForm(document?: DocumentModel): DocumentFormModel | undefined {
  if (!document) return undefined;
  return {
    bkey: document.bkey, // readonly
    fullPath: document.fullPath,
    title: document.title,
    altText: document.altText,
    type: document.type,
    source: document.source,
    url: document.url,
    mimeType: document.mimeType,
    size: document.size,
    authorKey: document.authorKey,
    authorName: document.authorName,
    dateOfDocCreation: document.dateOfDocCreation,
    dateOfDocLastUpdate: document.dateOfDocLastUpdate,
    locationKey: document.locationKey,
    hash: document.hash,
    priorVersionKey: document.priorVersionKey,
    version: document.version,
    description: document.description,
    tags: document.tags,
    parents: document.parents,
    tenants: document.tenants,
  };
}

/**
 * Only convert back the fields that can be changed by the user.
 * @param document  the document to be updated.
 * @param vm  the view model, ie. the form data with the updated values.
 * @returns the updated document.
 */
export function convertFormToDocument(vm?: DocumentFormModel, document?: DocumentModel | undefined): DocumentModel {
  if (!document) die('document.util.convertFormToDocument: document is mandatory.');
  if (!vm) return document;
  
  document.fullPath = vm.fullPath ?? '';
  document.title = vm.title ?? DEFAULT_TITLE;
  document.altText = vm.altText ?? '';
  document.type = vm.type ?? DEFAULT_DOCUMENT_TYPE;
  document.source = vm.source ?? DEFAULT_DOCUMENT_SOURCE;
  document.url = vm.url ?? '';
  document.mimeType = vm.mimeType ?? '';
  document.size = vm.size ?? 0;
  document.authorKey = vm.authorKey ?? DEFAULT_KEY;
  document.authorName = vm.authorName ?? DEFAULT_NAME;
  document.dateOfDocCreation = vm.dateOfDocCreation ?? DEFAULT_DATE;
  document.dateOfDocLastUpdate = vm.dateOfDocLastUpdate ?? DEFAULT_DATE;
  document.locationKey = vm.locationKey ?? DEFAULT_KEY;
  document.hash = vm.hash ?? '';
  document.priorVersionKey = vm.priorVersionKey ?? DEFAULT_KEY;
  document.version = vm.version ?? '';
  document.description = vm.description ?? DEFAULT_NOTES;
  document.priorVersionKey = vm.priorVersionKey ?? DEFAULT_KEY;
  document.tags = vm.tags ?? DEFAULT_TAGS;
  return document;
}

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
  index = addIndexElement(index, 'p', document.parents.join(' '));
  return index;
}

/**
 * Returns a string explaining the structure of the index.
 * This can be used in info boxes on the GUI.
 */
export function getDocumentIndexInfo(): string {
  return 'n:filename h:ash m:imeType p:arents';
}

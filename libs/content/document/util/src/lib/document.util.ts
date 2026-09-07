import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Platform } from '@ionic/angular/standalone';

import { DOCUMENT_DIR, DocumentModel, IMAGE_CONFIG_SHAPE, ImageConfig, UserModel } from '@okr/shared-models';
import { addIndexElement, getFileHash, getFullName, getTodayStr, isPhotoCancellation, resolveMimeType, warn } from '@okr/shared-util-core';

import { readAsFile } from '@okr/avatar-util';


/* ---------------------- Camera -------------------------*/
/**
 * Select a photo from the camera or the photo library.
 * @returns the image taken or selected
 */
export async function pickPhoto(platform: Platform): Promise<File | undefined> {
  let photo;
  try {
    photo = await Camera.getPhoto({
      quality: 90,
      allowEditing: false,
      resultType: CameraResultType.Uri,
      source: platform.is('mobile') ? CameraSource.Prompt : CameraSource.Photos,
    });
  } catch (ex) {
    // user cancelling the picker is normal control flow, not an error
    if (isPhotoCancellation(ex)) return undefined;
    throw ex;
  }
  return await readAsFile(photo, platform);
}

/* ---------------------- Helpers -------------------------*/

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
  doc.okey = hash;
  doc.hash = hash;
  doc.title = file.name;
  doc.altText = file.name;
  doc.fullPath = storagePath;
  doc.mimeType = resolveMimeType(file.name, file.type);
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

/* ---------------------- Mime classes -------------------------*/
/**
 * The coarse file classes a caller can filter a document list by. Deliberately NOT the raw mime
 * type: a link that wants "images and pdfs" must not have to enumerate image/jpeg, image/png,
 * image/heic, … The album's AlbumConfig (showPdfs/showVideos/showDocs) draws the same lines.
 */
export type MimeClass = 'image' | 'pdf' | 'video' | 'audio' | 'doc';

export const MIME_CLASSES: MimeClass[] = ['image', 'pdf', 'video', 'audio', 'doc'];

/** Classify a mime type. Anything unrecognised is a 'doc' — the catch-all, as in the album. */
export function getMimeClass(mimeType?: string): MimeClass {
  const mime = (mimeType ?? '').toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime === 'application/pdf') return 'pdf';
  return 'doc';
}

/**
 * Parse a `?mime=image,pdf` query parameter into the classes to keep.
 * Unknown entries are dropped rather than failing the whole filter — a typo in a hand-written
 * link degrades to "the classes I did understand", and an entirely unknown value to "no filter",
 * which is the same as leaving the parameter off. Never returns a filter nothing can match.
 */
export function parseMimeFilter(raw?: string): MimeClass[] {
  if (!raw) return [];
  const classes = raw.split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry): entry is MimeClass => (MIME_CLASSES as string[]).includes(entry));
  return [...new Set(classes)];
}

/** Whether a document passes the mime filter. An empty filter means "no filter" — everything passes. */
export function mimeMatches(mimeType: string | undefined, filter: MimeClass[]): boolean {
  if (filter.length === 0) return true;
  return filter.includes(getMimeClass(mimeType));
}

/**
 * Map a document to the ImageConfig the full-screen viewer renders.
 * `url` is the STORAGE PATH (fullPath), not the download url: the imgix pipes and overlay params
 * the viewer applies are built from the path.
 */
export function toGalleryImage(document: DocumentModel): ImageConfig {
  return {
    ...IMAGE_CONFIG_SHAPE,
    label: document.title,
    url: document.fullPath,
    altText: document.altText,
    documentKey: document.okey
  };
}

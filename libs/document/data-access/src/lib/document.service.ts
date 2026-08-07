import { Injectable, inject } from '@angular/core';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { FullMetadata, deleteObject, getDownloadURL, getMetadata, listAll, ref } from "firebase/storage";
import { Observable, firstValueFrom, of } from 'rxjs';

import { ENV, STORAGE } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { I18nService } from '@okr/shared-i18n';
import { DocumentCollection, DocumentModel, DocumentRendering, UserModel } from '@okr/shared-models';
import { error } from '@okr/shared-util-angular';
import { DateFormat, convertDateFormatToString, fileSizeUnit, getSystemQuery, getTodayStr } from '@okr/shared-util-core';

import { getDocumentIndex, getDocumentStoragePath } from '@okr/document-util';
import { DEFAULT_DOCUMENT_SOURCE, DEFAULT_DOCUMENT_TYPE, DEFAULT_KEY, DEFAULT_NOTES } from '@okr/shared-constants';
import { PFX } from './scope';

@Injectable({
  providedIn: 'root'
})
export class DocumentService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly storage = inject(STORAGE);
  private readonly i18nService = inject(I18nService);
  private readonly i18n = this.i18nService.translateAll({
    create_conf:  PFX + 'create.conf',
    create_error: PFX + 'create.error',
    update_conf:  PFX + 'update.conf',
    update_error: PFX + 'update.error',
    delete_conf:  PFX + 'delete.conf',
    delete_error: PFX + 'delete.error',
  });

  private readonly tenantId = this.env.tenantId;

  /*-------------------------- CRUD operations --------------------------------*/
  /**
   * Save a new document into the database.
   * @param document the new document to be saved
   * @param currentUser the current user (used as the author of the initial comment)
   * @returns the document id of the new DocumentModel in the database
   */
  public async create(document: DocumentModel, currentUser?: UserModel): Promise<string | undefined> {
    document.index = getDocumentIndex(document);
    if (document.okey) {
      // Dedup by hash: skip creation if a doc with this key already exists.
      // A read of a not-yet-existing, tenant-scoped doc is denied by the rules
      // (resource is null → tenantRead() fails), which rejects firstValueFrom.
      // Treat any read failure as "does not exist" and proceed to create.
      try {
        const existing = await firstValueFrom(this.firestoreService.readModel<DocumentModel>(DocumentCollection, document.okey));
        if (existing) return document.okey;
      } catch {
        // not found / not readable → fall through to create
      }
    }
    return await this.firestoreService.createModel<DocumentModel>(DocumentCollection, document, this.i18n.create_conf(), this.i18n.create_error(), currentUser);
  }

  /**
   * Read a document from the database by returning an Observable of a DocumentModel by key.
   * Uses a direct document fetch (docData) instead of a full list scan.
   * @param key the key of the model document
   */
  public read(key: string): Observable<DocumentModel | undefined> {
    return this.firestoreService.readModel<DocumentModel>(DocumentCollection, key);
  }

  /**
   * Update an existing document with new values.
   * @param document the DocumentModel with the new values
   */
  public async update(document: DocumentModel, currentUser?: UserModel): Promise<string | undefined> {
    document.index = getDocumentIndex(document);
    return await this.firestoreService.updateModel<DocumentModel>(DocumentCollection, document, false, this.i18n.update_conf(), this.i18n.update_error(), currentUser);
  }

  /**
   * Delete an existing document in the database by archiving it.
   * @param document the DocumentModel to be deleted.
   */
  public async delete(document: DocumentModel, currentUser?: UserModel): Promise<void> {
    await this.firestoreService.deleteModel<DocumentModel>(DocumentCollection, document, this.i18n.delete_conf(), this.i18n.delete_error(), currentUser);
  }

  /**
   * Permanently delete a document: removes the file from Firebase Storage and
   * hard-deletes the DocumentModel from Firestore (no archiving).
   * Use this only for isolated documents that are not shared across folders
   * (e.g. RAG documents — see APPARCH.md).
   * @param document the DocumentModel to be permanently deleted.
   */
  public async hardDelete(document: DocumentModel): Promise<void> {
    await deleteObject(ref(this.storage, document.fullPath));
    await this.deleteRenderings(document);
    await this.firestoreService.deleteObject(DocumentCollection, document.okey, PFX + 'remove.conf');
  }

  /**
   * Delete every rendering (alternate format) of a document from Storage — without this, each
   * vectorized document leaves an orphaned SVG behind. Best-effort per entry: a rendering that is
   * already gone must not abort the deletion of the others.
   * `renderings` is coalesced: legacy documents have no such field.
   */
  private async deleteRenderings(document: DocumentModel): Promise<void> {
    await Promise.all((document.renderings ?? []).map(async (rendering) => {
      try {
        await deleteObject(ref(this.storage, rendering.fullPath));
      } catch (ex) {
        error(undefined, `DocumentService.deleteRenderings: could not delete ${rendering.fullPath}: ${JSON.stringify(ex)}`);
      }
    }));
  }

  /*-------------------------- RENDERINGS --------------------------------*/
  /**
   * Generate an SVG rendering of a JPG/PNG document (vtracer, via the vectorizeDocument CF).
   * The CF writes both the Storage object and the `renderings[]` entry, so there is no save step
   * here; re-running with different settings replaces the previous result.
   * @param docKey the document to vectorize
   * @param preset 'logo' (line art, binary) or 'photo' (flat colour graphics)
   * @param detail maps onto vtracer's filterSpeckle — lower keeps more small shapes
   * @returns the new rendering
   */
  public async vectorize(docKey: string, preset: 'logo' | 'photo' = 'logo', detail?: number): Promise<DocumentRendering> {
    const fn = httpsCallable<{ docKey: string; tenantId: string; preset: string; detail?: number }, DocumentRendering>(
      getFunctions(getApp(), 'europe-west6'), 'vectorizeDocument'
    );
    const result = await fn({ docKey, tenantId: this.tenantId, preset, detail });
    return result.data;
  }

 /*-------------------------- LIST / QUERY / FILTER --------------------------------*/
 /**
   * List all documents.
   * @param orderBy 
   * @param sortOrder 
   * @returns 
   */
  public list(orderBy = 'dateOfDocLastUpdate', sortOrder = 'asc'): Observable<DocumentModel[]> {
    return this.firestoreService.searchData<DocumentModel>(DocumentCollection, getSystemQuery(this.tenantId), orderBy, sortOrder);
  }

  /** One-shot, consistent read (no cache-first race). Promise counterpart to {@link list}. */
  public listOnce(orderBy = 'dateOfDocLastUpdate', sortOrder = 'asc'): Promise<DocumentModel[]> {
    return this.firestoreService.getDataOnce<DocumentModel>(DocumentCollection, getSystemQuery(this.tenantId), orderBy, sortOrder);
  }

  public listDocumentsByStorageDirectory(modelType: string, key: string): Observable<DocumentModel[]> {
    const dir = getDocumentStoragePath(this.tenantId, modelType, key);
    return dir ? this.listDocumentsByDirectory(dir) : of<DocumentModel[]>([]);
  }

  public listDocumentsByDirectory(dir: string, orderBy = 'dateOfDocLastUpdate', sortOrder = 'asc'): Observable<DocumentModel[]> {
    const dbQuery = getSystemQuery(this.tenantId);
    dbQuery.push({ key: 'dir', operator: '==', value: dir });
    return this.firestoreService.searchData<DocumentModel>(DocumentCollection, dbQuery, orderBy, sortOrder);
  }

  public async listDocumentsFromStorageDirectory(modelType: string, key: string): Promise<DocumentModel[]> {
    const docs: DocumentModel[] = [];
    const path = getDocumentStoragePath(this.tenantId, modelType, key);
    const _ref = ref(this.storage, path);
    try {
      const items = await listAll(_ref);
      await Promise.all(items.items.map(async (_item) => {
        const metadata = await getMetadata(_item);
        const doc = await this.convertStorageMetadataToDocumentModel(metadata);
        docs.push(doc);
      }));
    }
    catch(ex) {
      error(undefined, 'DocumentService.listDocumentsFromStorageDirectory: ERROR: ' + JSON.stringify(ex));
    }
    return docs;
  }
  
  /*-------------------------- CONVERSION --------------------------------*/
  /**
   * Convert a file to a DocumentModel.
   * @param file the file to convert
   * @param fullPath the full path of the file (/dir/filename.extension)
   * @returns the DocumentModel
   */
  public async getDocumentFromFile(file: File, fullPath: string): Promise<DocumentModel> {
    const doc = new DocumentModel(this.tenantId);
    doc.fullPath = fullPath;
    doc.description = DEFAULT_NOTES;
    doc.type = DEFAULT_DOCUMENT_TYPE;
    doc.source = DEFAULT_DOCUMENT_SOURCE;

    doc.url = await getDownloadURL(ref(this.storage, fullPath));
    doc.dateOfDocCreation = getTodayStr();
    doc.dateOfDocLastUpdate = getTodayStr();
    doc.mimeType = file.type;
    doc.size = file.size;
    doc.priorVersionKey = DEFAULT_KEY;
    doc.version = '1.0.0';
    doc.isArchived = false;
    return doc;
  }

  private async convertStorageMetadataToDocumentModel(metadata: FullMetadata): Promise<DocumentModel> {
    const doc = new DocumentModel(this.tenantId);
    doc.fullPath = metadata.fullPath;
    doc.description = DEFAULT_NOTES;
    doc.type = DEFAULT_DOCUMENT_TYPE;
    doc.source = DEFAULT_DOCUMENT_SOURCE;
    doc.url = await getDownloadURL(ref(this.storage, metadata.fullPath));
    // doc.url = getImgixUrl(metadata.fullPath, undefined);
    doc.dateOfDocCreation = convertDateFormatToString(metadata.timeCreated.substring(0, 10), DateFormat.IsoDate, DateFormat.StoreDate);
    doc.dateOfDocLastUpdate = convertDateFormatToString(metadata.updated.substring(0, 10), DateFormat.IsoDate, DateFormat.StoreDate);
    doc.mimeType = metadata.contentType ?? '';
    doc.size = metadata.size;
    doc.priorVersionKey = DEFAULT_KEY;
    doc.version = '1.0.0';
    doc.isArchived = false;
    // we do not use metadata.md5Hash as we use the more secure SHA-256 hash
    return doc;
  }

  /*-------------------------- STORAGE --------------------------------*/
  /**
   * Check if a document exists at a specific location in the storage.
   * @param fullPath the specific location in the storage
   * @param isStrict if true, the functiond throws an error if the document does not exist
   * @returns true if the document exists in the given storage location, false otherwise
   */
  public async doesDocumentExistInStorage(fullPath: string, isStrict = true): Promise<boolean> {
    try {
      await getDownloadURL(ref(this.storage, fullPath));
      return true;
    }
    catch {
      if (isStrict === true) {
        error(undefined, 'DocumentService.doesDocumentExistInStorage: ERROR: document ' + fullPath + ' does not exist in storage.');
      }
      return false;
    }
  }

  /**
   * Returns the size of a document.
   * @param path the full path of the document in the storage
   * @returns the size of the document in bytes or undefined if the document does not exist
   */
  public async getSize(path: string): Promise<number | undefined>{
    const _ref = ref(this.storage, path);
    try {
      const metadata = await getMetadata(_ref);
      console.log('DocumentService.getSize: metadata: ' + JSON.stringify(metadata));
      return metadata.size;
    }
    catch(ex) {
      error(undefined, 'DocumentService.getSize: ERROR: ' + JSON.stringify(ex));
    }
    return undefined;
  }

  /**
   * Calculates the sum of the sizes of all files in a given path.
   * items = files, prefixes = folders
   * @param path a directory in the storage
   * @param isRecursive 
   */
  public async calculateStorageConsumption(path: string, isRecursive = false): Promise<void> {
    const _ref = ref(this.storage, path);
    let totalSize = 0;
    console.log('Calculating storage consumption for ' + path);
    try {
      const result = await listAll(_ref);
      for (const item of result.items) {
        const size = (await getMetadata(item)).size;
        console.log('    ' + item.fullPath + ': ' + size);
        totalSize += size;
      }
      console.log(path + ': ' + result.items.length + ' files with ' + fileSizeUnit(totalSize));
      if (isRecursive === true) {
        for (const prefix of result.prefixes) {
          await this.calculateStorageConsumption(prefix.fullPath, true);
        }
      }
    }
    catch(ex) {
      error(undefined, 'DocumentService.calculateStorageConsumption: ERROR: ' + JSON.stringify(ex));
    }
  }

  /**
   * Print the metadata of a document in the storage for debugging purposes.
   * @param path the full path of the document in the storage
   */
  public async getRefInfo(path: string): Promise<void> {
    const _ref = ref(this.storage, path);
    console.log(_ref.fullPath + ': ');
    try {
      const metadata = await getMetadata(_ref);
      console.log('    contentType: ' + metadata.contentType);
      console.log('    size: ' + fileSizeUnit(metadata.size));
      console.log('    created: ' + metadata.timeCreated);
    }
    catch(ex) {
      console.log('    no metadata; probably it is a folder.', ex);
    }
  }
}
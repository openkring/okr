import { Injectable, inject } from '@angular/core';
import { FullMetadata, getDownloadURL, getMetadata, listAll, ref } from "firebase/storage";
import { Observable, of } from 'rxjs';

import { ENV, STORAGE } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { DocumentCollection, DocumentModel, UserModel } from '@bk2/shared-models';
import { error } from '@bk2/shared-util-angular';
import { DateFormat, convertDateFormatToString, fileSizeUnit, findByKey, generateRandomString, getSystemQuery, getTodayStr } from '@bk2/shared-util-core';

import { getDocumentIndex, getDocumentStoragePath } from '@bk2/document-util';
import { DEFAULT_DOCUMENT_SOURCE, DEFAULT_DOCUMENT_TYPE, DEFAULT_KEY, DEFAULT_NOTES } from '@bk2/shared-constants';

@Injectable({
  providedIn: 'root'
})
export class DocumentService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly storage = inject(STORAGE);

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
    return await this.firestoreService.createModel<DocumentModel>(DocumentCollection, document, '@document.operation.create', currentUser);
  } 

  /**
   * Read a document from the database by returning an Observable of a DocumentModel by key.
   * @param key the key of the model document
   */
  public read(key: string): Observable<DocumentModel | undefined> {
    console.log('DocumentService.read', key);
    this.list().subscribe(docs => {
      console.log('DocumentService.read: listed documents', docs.map(d => d.bkey));
    });
    return findByKey<DocumentModel>(this.list(), key);    
  }

  /**
   * Update an existing document with new values.
   * @param document the DocumentModel with the new values
   */
  public async update(document: DocumentModel, currentUser?: UserModel, confirmMessage = '@document.operation.update'): Promise<string | undefined> {
    document.index = getDocumentIndex(document);
    return await this.firestoreService.updateModel<DocumentModel>(DocumentCollection, document, false, confirmMessage, currentUser);
  }

  /**
   * Delete an existing document in the database by archiving it.
   * @param document the DocumentModel to be deleted.
   */
  public async delete(document: DocumentModel, currentUser?: UserModel): Promise<void> {
    await this.firestoreService.deleteModel<DocumentModel>(DocumentCollection, document, '@document.operation.delete', currentUser);
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
    doc.bkey = generateRandomString(10);
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
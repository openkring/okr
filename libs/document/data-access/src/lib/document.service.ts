import { Injectable, inject } from '@angular/core';
import { map, Observable, of } from 'rxjs';
import { ref, getDownloadURL, getMetadata, listAll, FullMetadata } from "firebase/storage";

import { DocumentTypes, getCategoryAbbreviation } from '@bk2/shared/categories';
import { DocumentCollection, DocumentModel, DocumentType, ModelType, UserModel } from '@bk2/shared/models';
import { DateFormat, addIndexElement, convertDateFormatToString, die, dirName, fileExtension, fileName, fileSizeUnit, findByKey, generateRandomString, getSystemQuery, getTodayStr} from '@bk2/shared/util-core';
import { error } from '@bk2/shared/util-angular';
import { ENV, STORAGE } from '@bk2/shared/config';
import { FirestoreService } from '@bk2/shared/data-access';

import { getDocumentStoragePath } from '@bk2/document/util';

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
    document.index = this.getSearchIndex(document);
    return await this.firestoreService.createModel<DocumentModel>(DocumentCollection, document, '@document.operation.create', currentUser);
  } 

  /**
   * Read a document from the database by returning an Observable of a DocumentModel by key.
   * @param key the key of the model document
   */
  public read(key: string): Observable<DocumentModel | undefined> {
    return findByKey<DocumentModel>(this.list(), key);    
  }

  /**
   * Update an existing document with new values.
   * @param document the DocumentModel with the new values
   */
  public async update(document: DocumentModel, currentUser?: UserModel, confirmMessage = '@document.operation.update'): Promise<string | undefined> {
    document.index = this.getSearchIndex(document);
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
  public list(orderBy = 'name', sortOrder = 'asc'): Observable<DocumentModel[]> {
    return this.firestoreService.searchData<DocumentModel>(DocumentCollection, getSystemQuery(this.tenantId), orderBy, sortOrder);
  }

  public listDocumentsByStorageDirectory(modelType: ModelType, key: string): Observable<DocumentModel[]> {
    const _dir = getDocumentStoragePath(this.tenantId, modelType, key);
    return _dir ? this.listDocumentsByDirectory(_dir) : of<DocumentModel[]>([]);
  }

  public listDocumentsByDirectory(dir: string, orderBy = 'name', sortOrder = 'asc'): Observable<DocumentModel[]> {
    const _dbQuery = getSystemQuery(this.tenantId);
    _dbQuery.push({ key: 'dir', operator: '==', value: dir });
    return this.firestoreService.searchData<DocumentModel>(DocumentCollection, _dbQuery, orderBy, sortOrder);
  }

  public async listDocumentsFromStorageDirectory(modelType: ModelType, key: string): Promise<DocumentModel[]> {
    const _docs: DocumentModel[] = [];
    const _path = getDocumentStoragePath(this.tenantId, modelType, key);
    const _ref = ref(this.storage, _path);
    try {
      const _items = await listAll(_ref);
      await Promise.all(_items.items.map(async (_item) => {
        const _metadata = await getMetadata(_item);
        const _doc = await this.convertStorageMetadataToDocumentModel(_metadata);
        _docs.push(_doc);
      }));
    }
    catch(_ex) {
      error(undefined, 'DocumentService.listDocumentsFromStorageDirectory: ERROR: ' + JSON.stringify(_ex));
    }
    return _docs;
  }
  
  /*-------------------------- CONVERSION --------------------------------*/
  /**
   * Convert a file to a DocumentModel.
   * @param file the file to convert
   * @param fullPath the full path of the file (/dir/filename.extension)
   * @returns the DocumentModel
   */
  public async getDocumentFromFile(file: File, fullPath: string): Promise<DocumentModel> {
    const _doc = new DocumentModel(this.tenantId);
    _doc.fullPath = fullPath;
    _doc.description = '';
    _doc.type = DocumentType.InternalFile;

    _doc.url = await getDownloadURL(ref(this.storage, fullPath));
    _doc.dateOfDocCreation = getTodayStr();
    _doc.dateOfDocLastUpdate = getTodayStr();
    _doc.mimeType = file.type;
    _doc.size = file.size;
    _doc.priorVersionKey = '';
    _doc.version = '1.0.0';
    _doc.isArchived = false;
    return _doc;
  }

  private async convertStorageMetadataToDocumentModel(metadata: FullMetadata): Promise<DocumentModel> {
    const _doc = new DocumentModel(this.tenantId);
    _doc.bkey = generateRandomString(10);
    _doc.fullPath = metadata.fullPath;
    _doc.description = '';
    _doc.type = DocumentType.InternalFile;
    _doc.url = await getDownloadURL(ref(this.storage, metadata.fullPath));
    //_doc.url = getImgixUrl(metadata.fullPath, undefined);
    _doc.dateOfDocCreation = convertDateFormatToString(metadata.timeCreated.substring(0, 10), DateFormat.IsoDate, DateFormat.StoreDate);
    _doc.dateOfDocLastUpdate = convertDateFormatToString(metadata.updated.substring(0, 10), DateFormat.IsoDate, DateFormat.StoreDate);
    _doc.mimeType = metadata.contentType ?? '';
    _doc.size = metadata.size;
    _doc.priorVersionKey = '';
    _doc.version = '1.0.0';
    _doc.isArchived = false;
    _doc.md5hash = metadata.md5Hash ?? '';
    return _doc;
  }
  
  /*-------------------------- SEARCH INDEX --------------------------------*/
  public getSearchIndex(document: DocumentModel): string {
    if (document.type === undefined) die('DocumentService.getSearchIndex: ERROR: document.type is mandatory.');
    let _index = '';
    _index = addIndexElement(_index, 'n', fileName(document.fullPath));
    _index = addIndexElement(_index, 'c', getCategoryAbbreviation(DocumentTypes, document.type));
    _index = addIndexElement(_index, 'e', fileExtension(document.fullPath));
    _index = addIndexElement(_index, 'd', dirName(document.fullPath));
    return _index;
    }

  /**
   * Returns a string explaining the structure of the index.
   * This can be used in info boxes on the GUI.
   */
  public getSearchIndexInfo(): string {
    return 'n:name c:documentTypeAbbreviation e:extension, d:directory';
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
      const _metadata = await getMetadata(_ref);
      console.log('DocumentService.getSize: metadata: ' + JSON.stringify(_metadata));
      return _metadata.size;
    }
    catch(_ex) {
      error(undefined, 'DocumentService.getSize: ERROR: ' + JSON.stringify(_ex));
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
    let _totalSize = 0;
    console.log('Calculating storage consumption for ' + path);
    try {
      const _result = await listAll(_ref);
      for (const _item of _result.items) {
        const _size = (await getMetadata(_item)).size;
        console.log('    ' + _item.fullPath + ': ' + _size);
        _totalSize += _size;
      }
      console.log(path + ': ' + _result.items.length + ' files with ' + fileSizeUnit(_totalSize));
      if (isRecursive === true) {
        for (const _prefix of _result.prefixes) {
          await this.calculateStorageConsumption(_prefix.fullPath, true);
        }
      }
    }
    catch(_ex) {
      error(undefined, 'DocumentService.calculateStorageConsumption: ERROR: ' + JSON.stringify(_ex));
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
      const _metadata = await getMetadata(_ref);
      console.log('    contentType: ' + _metadata.contentType);
      console.log('    size: ' + fileSizeUnit(_metadata.size));
      console.log('    created: ' + _metadata.timeCreated);
      console.log('    hash: ' + _metadata.md5Hash);
    }
    catch(_ex) {
      console.log('    no metadata; probably it is a folder.', _ex);
    }
  }
}
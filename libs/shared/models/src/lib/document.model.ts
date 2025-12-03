import { BkModel, SearchableModel, TaggedModel } from './base.model';
import { DEFAULT_DATE, DEFAULT_DOCUMENT_SOURCE, DEFAULT_DOCUMENT_TYPE, DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_PATH, DEFAULT_TAGS, DEFAULT_TENANTS, DEFAULT_TITLE, DEFAULT_URL } from '@bk2/shared-constants';

export const DOCUMENT_DIR = 'documents';
export const EZS_DIR = 'ezs';

/**
 * Terminology:
 *
 * fullPath = {/dir}/baseName.ext (can be relative or absolute, ie starting with /)
 * (file)name = baseName.ext                  fileName(fullPath), baseName + . + extension
 * dir = path/to/a                            dirName(fullPath)
 * baseName = baseName                        baseName(fullPath) = fileName without extension
 * extension = ext                            fileExtension(fullPath)
 *
 * fullPath is set explicitly. All other parts can be derived from fullPath.
 */
export class DocumentModel implements BkModel, SearchableModel, TaggedModel {
  public bkey = DEFAULT_KEY;
  public tenants: string[] = DEFAULT_TENANTS;
  public isArchived = false;
  public index = DEFAULT_INDEX;
  public tags = DEFAULT_TAGS;
  public parents: string[] = []; // a document can belong to more than one parent entity.
  // for each such parent, an entry modelType.key is entered here
  // this enables to find all documents for a given parent entity.

  public fullPath = DEFAULT_PATH; // {/dir}/baseName.extension in firebase storage
  public description = DEFAULT_NOTES; // a human-readable, translatable file name (i18n)
  public title = DEFAULT_TITLE; // e.g. short image title
  public altText = ''; // alternate text for images (default = name)

  public type = DEFAULT_DOCUMENT_TYPE;   // marketing, doc, hr, business, finance, info, legal etc.
  public source = DEFAULT_DOCUMENT_SOURCE;   // name, storage, external
  public url = DEFAULT_URL; // url: url of the original file
  public mimeType = ''; // = firestorage:  contentType
  public size = 0;
  public authorKey = DEFAULT_KEY; // the author of the document, does not need to be the same as the person that saved the file
  public authorName = DEFAULT_NAME; // the author of the document, does not need to be the same as the person that save the file
  public dateOfDocCreation = DEFAULT_DATE; // the date the document was created
  public dateOfDocLastUpdate = DEFAULT_DATE; // the date the document was last updated
  public locationKey = DEFAULT_KEY; // the location where an image was taken
  public hash = ''; // hash value of the file (SHA-256)
  public priorVersionKey = DEFAULT_KEY; // this links to prior version of the document
  public version = '';  // this is an arbitrary version string, e.g. a timestamp that can be user defined

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const DocumentCollection = 'docs';
export const DocumentModelName = 'document';

// tbd: Protocol can be derived for external files (absolute link: protocol)
// ftp/s, http/s, webdav, etc.

// tbd: Provider can be derived for external files (absolute link: domain)
// dropbox, google drive, tresorit, sharepoint, icloud, firebase, nextcloud, website (= other)


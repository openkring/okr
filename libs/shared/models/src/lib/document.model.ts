import { BkModel, SearchableModel, TaggedModel } from "./base.model";
import { DocumentType } from "./enums/document-type.enum";

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
  public bkey = '';
  public tenants: string[] = [];
  public isArchived = false;
  public index = '';
  public tags = '';

  public fullPath = '';                                   // {/dir}/baseName.extension in firebase storage
  public description = '';                                // a human-readable, translatable file name (i18n)
  public title = '';                                      // e.g. short image title
  public altText = '';                                    // alternate text for images (default = name)

  public type: DocumentType | undefined = undefined;
  public url = '';                                        // url: url of the original file
  public mimeType = '';                                   // = firestorage:  contentType
  public size = 0;
  public authorKey = '';                                  // the author of the document, does not need to be the same as the person that saved the file
  public authorName = '';                                 // the author of the document, does not need to be the same as the person that save the file
  public dateOfDocCreation = '';                          // the date the document was created
  public dateOfDocLastUpdate = '';                        // the date the document was last updated
  public locationKey = '';                                // the location where an image was taken 
  public md5hash = '';                                    // md5hash value of the file
  public priorVersionKey = '';
  public version = '';
  
  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}


  // tbd: add md5hash
  // { name: 'md5hash', label: 'model.document.field.md5hash', value: false },
  //   public md5hash: string;  // from firestorage

export const DocumentCollection = 'documents';
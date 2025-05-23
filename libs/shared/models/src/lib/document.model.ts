import { BkModel, NamedModel, SearchableModel, TaggedModel } from "./base.model";
import { DocumentType } from "./enums/document-type.enum";

export const DOCUMENT_DIR = 'documents';
export const EZS_DIR = 'ezs';

export class DocumentModel implements BkModel, NamedModel, SearchableModel, TaggedModel {
  public bkey = '';
  public tenants: string[] = [];
  public isArchived = false;
  public index = '';
  public tags = '';
  public name = '';                                       // name must match with the name of the file in firebase storage (fileName + . + extension)
  public description = '';                                // a human-readable, translatable file name (i18n)
  public docType: DocumentType | undefined = undefined;
  public url = '';                                        // url: url of the original file
  public creationDate = '';                               // firestorage timeCreated
  public lastUpdate = '';                                 // firestorage updated
  public fullPath = '';                                   // dir + / + fileName + . + extension in firebase storage
  public dir = '';
  public fileName = '';                                   // the file name without extension
  public extension = '';
  public mimeType = '';                                   // = firestorage:  contentType
  public size = 0;
  public title = '';                                      // e.g. short image title
  public altText = '';                                    // alternate text for images (default = name)
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
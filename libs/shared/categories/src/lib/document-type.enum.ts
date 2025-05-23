import { CategoryModel, DocumentType } from "@bk2/shared/models";

export type DocumentTypeCategory = CategoryModel;

export const DocumentTypes: DocumentTypeCategory[] = [
  {
    id: DocumentType.ExternalWebsite,
    abbreviation: 'SITE',
    name: 'externalWebsite',
    i18nBase: 'document.type.externalWebsite',
    icon: 'globe'
  },
  {
    id: DocumentType.ExternalFile,
    abbreviation: 'EXTF',
    name: 'externalFile',
    i18nBase: 'document.type.externalFile',
    icon: 'document'
  },
  {
    id: DocumentType.InternalFile,
    abbreviation: 'INTF',
    name: 'internalFile',
    i18nBase: 'document.type.internalFile',
    icon: 'document'
  },
  {
    id: DocumentType.LocalFile,
    abbreviation: 'LOCF',
    name: 'localFile',
    i18nBase: 'document.type.localFile',
    icon: 'document'
  }
]

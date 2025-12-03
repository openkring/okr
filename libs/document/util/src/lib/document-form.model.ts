import { DEFAULT_DATE, DEFAULT_DOCUMENT_SOURCE, DEFAULT_DOCUMENT_TYPE, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_TAGS, DEFAULT_TENANTS, DEFAULT_TITLE, DEFAULT_URL } from '@bk2/shared-constants';

export type DocumentFormModel = {
  bkey: string,
  fullPath: string,
  title: string,
  altText: string,
  type: string,
  source: string,
  url: string,
  mimeType: string,
  size: number,
  authorKey: string,
  authorName: string,
  dateOfDocCreation: string,
  dateOfDocLastUpdate: string,
  locationKey: string,
  hash: string,
  priorVersionKey: string,
  version: string,
  description: string
  tags: string,
  parents: string[],
  tenants: string[]
};

export const DOCUMENT_FORM_SHAPE: DocumentFormModel = {
  bkey: DEFAULT_KEY,
  fullPath: '',
  description: DEFAULT_NOTES,
  title: DEFAULT_TITLE,
  altText: '',
  type: DEFAULT_DOCUMENT_TYPE,
  source: DEFAULT_DOCUMENT_SOURCE,
  url: DEFAULT_URL,
  mimeType: '',
  size: 0,
  authorKey: DEFAULT_KEY,
  authorName: DEFAULT_NAME,
  dateOfDocCreation: DEFAULT_DATE,
  dateOfDocLastUpdate: DEFAULT_DATE,
  locationKey: DEFAULT_KEY,
  hash: '',
  priorVersionKey: DEFAULT_KEY,
  version: '',
  tags: DEFAULT_TAGS,
  parents: [],
  tenants: DEFAULT_TENANTS
};

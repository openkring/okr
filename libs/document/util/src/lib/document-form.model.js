import { DEFAULT_DATE, DEFAULT_DOCUMENT_SOURCE, DEFAULT_DOCUMENT_TYPE, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_TAGS, DEFAULT_TENANTS, DEFAULT_TITLE, DEFAULT_URL } from '@bk2/shared-constants';
export const DOCUMENT_FORM_SHAPE = {
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
//# sourceMappingURL=document-form.model.js.map
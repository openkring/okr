import { describe, expect, it } from 'vitest';
import { DocumentModel, FolderModel, UserModel } from '@okr/shared-models';
import { canDeleteDocument, canDeleteDocumentDirectly, canEditDocument, canUploadToFolder, isDocumentAuthor } from './document-permissions.util';

function user(roles: Record<string, boolean>, personKey = 'p1'): UserModel {
  return { roles, personKey } as unknown as UserModel;
}
const member = () => user({ registered: true });
const openFolder = { membersMayUpload: true } as FolderModel;
const closedFolder = { membersMayUpload: false } as FolderModel;
const ownDoc = { authorKey: 'p1' } as DocumentModel;
const foreignDoc = { authorKey: 'p2' } as DocumentModel;

describe('canUploadToFolder', () => {
  it('always allows manager roles and group-admins', () => {
    expect(canUploadToFolder(closedFolder, user({ contentAdmin: true }))).toBe(true);
    expect(canUploadToFolder(undefined, user({}), true)).toBe(true);
  });
  it('allows members only in an upload-enabled folder', () => {
    expect(canUploadToFolder(openFolder, member())).toBe(true);
    expect(canUploadToFolder(closedFolder, member())).toBe(false);
    expect(canUploadToFolder(undefined, member())).toBe(false); // no folder context (e.g. listId 'all')
  });
  it('denies legacy folders without the flag', () => {
    expect(canUploadToFolder({} as FolderModel, member())).toBe(false);
  });
});

describe('isDocumentAuthor', () => {
  it('matches authorKey against personKey', () => {
    expect(isDocumentAuthor(ownDoc, member())).toBe(true);
    expect(isDocumentAuthor(foreignDoc, member())).toBe(false);
    expect(isDocumentAuthor({} as DocumentModel, user({}, ''))).toBe(false);
  });
});

describe('canEditDocument', () => {
  it('allows managers on any doc', () => {
    expect(canEditDocument(foreignDoc, closedFolder, user({ privileged: true }))).toBe(true);
  });
  it('allows the author only inside an upload-enabled folder', () => {
    expect(canEditDocument(ownDoc, openFolder, member())).toBe(true);
    expect(canEditDocument(ownDoc, closedFolder, member())).toBe(false);
    expect(canEditDocument(foreignDoc, openFolder, member())).toBe(false);
  });
});

describe('canDeleteDocument', () => {
  it('allows admin and group-admin (moderation)', () => {
    expect(canDeleteDocument(foreignDoc, openFolder, user({ admin: true }))).toBe(true);
    expect(canDeleteDocument(foreignDoc, openFolder, member(), true)).toBe(true);
  });
  it('denies contentAdmin/privileged on foreign docs (delete stays narrow)', () => {
    expect(canDeleteDocument(foreignDoc, openFolder, user({ contentAdmin: true }))).toBe(false);
    expect(canDeleteDocument(foreignDoc, openFolder, user({ privileged: true }))).toBe(false);
  });
  it('allows the author on own uploads in an upload-enabled folder', () => {
    expect(canDeleteDocument(ownDoc, openFolder, member())).toBe(true);
    expect(canDeleteDocument(ownDoc, closedFolder, member())).toBe(false);
  });
});

describe('canDeleteDocumentDirectly', () => {
  const groupFolder = { okey: 'f1', ownerKey: 'p2' } as FolderModel;
  const docInGroupFolder = { authorKey: 'p2', folderKeys: ['f1'] } as DocumentModel;

  it('allows admin, the author, and the owner of the primary folder', () => {
    expect(canDeleteDocumentDirectly(docInGroupFolder, groupFolder, user({ admin: true }))).toBe(true);
    expect(canDeleteDocumentDirectly({ authorKey: 'p1', folderKeys: ['f1'] } as DocumentModel, groupFolder, user({}))).toBe(true);
    expect(canDeleteDocumentDirectly(docInGroupFolder, { okey: 'f1', ownerKey: 'p1' } as FolderModel, user({}))).toBe(true);
  });
  it('denies a group admin — firestore.rules cannot see group admin-ship', () => {
    // canDeleteDocument(..., isGroupAdmin=true) says yes for the same input; the gap is
    // exactly what routes the delete through the deleteGroupContent Cloud Function.
    expect(canDeleteDocument(docInGroupFolder, groupFolder, user({}), true)).toBe(true);
    expect(canDeleteDocumentDirectly(docInGroupFolder, groupFolder, user({}))).toBe(false);
  });
  it('only honours the FIRST folder key — the rules read folderKeys[0]', () => {
    const multi = { authorKey: 'p2', folderKeys: ['f0', 'f1'] } as DocumentModel;
    expect(canDeleteDocumentDirectly(multi, { okey: 'f1', ownerKey: 'p1' } as FolderModel, user({}))).toBe(false);
  });
  it('denies legacy documents and folders without keys', () => {
    expect(canDeleteDocumentDirectly({} as DocumentModel, {} as FolderModel, user({}))).toBe(false);
    expect(canDeleteDocumentDirectly(undefined, undefined, member())).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { FolderModel, UserModel } from '@okr/shared-models';
import { canUploadIntoFolder, canWriteFolderDirectly, canEditFolder, canManageFolders, isFolderOwner } from './folder-permissions.util';

function user(roles: Record<string, boolean>, personKey = 'p1'): UserModel {
  return { roles, personKey } as unknown as UserModel;
}
function folder(ownerKey = ''): FolderModel {
  return { ownerKey } as FolderModel;
}

describe('canManageFolders', () => {
  it('allows contentAdmin, privileged, admin', () => {
    expect(canManageFolders(user({ contentAdmin: true }))).toBe(true);
    expect(canManageFolders(user({ privileged: true }))).toBe(true);
    expect(canManageFolders(user({ admin: true }))).toBe(true);
  });
  it('allows group-admins without a global role', () => {
    expect(canManageFolders(user({}), true)).toBe(true);
  });
  it('denies plain members and anonymous', () => {
    expect(canManageFolders(user({ registered: true }))).toBe(false);
    expect(canManageFolders(undefined)).toBe(false);
  });
});

describe('isFolderOwner', () => {
  it('matches ownerKey against personKey', () => {
    expect(isFolderOwner(folder('p1'), user({}))).toBe(true);
    expect(isFolderOwner(folder('p2'), user({}))).toBe(false);
  });
  it('never matches a legacy folder without ownerKey', () => {
    // Firestore reads return raw objects — legacy folders have ownerKey undefined
    expect(isFolderOwner({} as FolderModel, user({}, ''))).toBe(false);
    expect(isFolderOwner(undefined, user({}))).toBe(false);
  });
});

describe('canEditFolder', () => {
  it('allows manager roles regardless of ownership', () => {
    expect(canEditFolder(folder('px'), user({ contentAdmin: true }))).toBe(true);
  });
  it('allows the owner without a role', () => {
    expect(canEditFolder(folder('p1'), user({ registered: true }))).toBe(true);
  });
  it('denies a non-owner member', () => {
    expect(canEditFolder(folder('px'), user({ registered: true }))).toBe(false);
  });
});

describe('canWriteFolderDirectly', () => {
  it('allows contentAdmin, privileged and the folder owner', () => {
    expect(canWriteFolderDirectly(folder('other'), user({ contentAdmin: true }))).toBe(true);
    expect(canWriteFolderDirectly(folder('other'), user({ privileged: true }))).toBe(true);
    expect(canWriteFolderDirectly(folder('p1'), user({}))).toBe(true);
  });
  it('denies a group admin — firestore.rules cannot see group admin-ship', () => {
    // canEditFolder(folder, user, true) is true for the same input; the difference is
    // exactly what forces the updateGroupFolder / deleteGroupContent detour.
    expect(canEditFolder(folder('other'), user({}), true)).toBe(true);
    expect(canWriteFolderDirectly(folder('other'), user({}))).toBe(false);
  });
  it('denies plain members and anonymous', () => {
    expect(canWriteFolderDirectly(folder('other'), user({ registered: true }))).toBe(false);
    expect(canWriteFolderDirectly(undefined, undefined)).toBe(false);
  });
});

describe('canUploadIntoFolder', () => {
  const openFolder = { ownerKey: '', membersMayUpload: true } as FolderModel;
  const closedFolder = { ownerKey: '', membersMayUpload: false } as FolderModel;
  /** Every folder written before the flag existed — the case that made the album upload fail. */
  const legacyFolder = { ownerKey: '' } as FolderModel;

  it('allows contentAdmin and privileged into any folder, flag or not', () => {
    expect(canUploadIntoFolder(closedFolder, user({ contentAdmin: true }))).toBe(true);
    expect(canUploadIntoFolder(legacyFolder, user({ privileged: true }))).toBe(true);
  });

  it('allows a plain member only into a folder that opted in', () => {
    expect(canUploadIntoFolder(openFolder, user({ registered: true }))).toBe(true);
    expect(canUploadIntoFolder(closedFolder, user({ registered: true }))).toBe(false);
  });

  it('treats a missing membersMayUpload as NO, matching the rule default', () => {
    expect(canUploadIntoFolder(legacyFolder, user({ registered: true }))).toBe(false);
  });

  it('does NOT let folder ownership stand in for the flag — the rule grants no such branch', () => {
    const owned = { ownerKey: 'p1' } as FolderModel;
    expect(canUploadIntoFolder(owned, user({ registered: true }, 'p1'))).toBe(false);
  });

  it('denies a member without a personKey, which the rule requires for authorKey', () => {
    expect(canUploadIntoFolder(openFolder, user({ registered: true }, ''))).toBe(false);
  });

  it('denies when there is no folder or no user', () => {
    expect(canUploadIntoFolder(undefined, user({ registered: true }))).toBe(false);
    expect(canUploadIntoFolder(openFolder, undefined)).toBe(false);
  });
});

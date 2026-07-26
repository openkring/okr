import { describe, expect, it } from 'vitest';
import { FolderModel, UserModel } from '@okr/shared-models';
import { canEditFolder, canManageFolders, isFolderOwner } from './folder-permissions.util';

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

import { describe, expect, it } from 'vitest';

import { userEditRedirectUrl } from './user-edit-redirect';

describe('userEditRedirectUrl', () => {
  it('sends the retired /user/:userKey page to the list, which opens the modal', () => {
    expect(userEditRedirectUrl('u1')).toBe('/user/all/c-users?edit=u1');
  });
  it('encodes the key', () => {
    expect(userEditRedirectUrl('a b&c')).toBe('/user/all/c-users?edit=a%20b%26c');
  });
  it('falls back to the plain list without a key', () => {
    expect(userEditRedirectUrl('')).toBe('/user/all/c-users');
    expect(userEditRedirectUrl(undefined)).toBe('/user/all/c-users');
  });
});

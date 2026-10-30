import { describe, it, expect } from 'vitest';
import { extractTagsFromStoragePath } from './storage-document.util';

describe('extractTagsFromStoragePath', () => {
  it('emits no tenant tag', () => {
    expect(extractTagsFromStoragePath('tenant/p13/album/123/photo.jpg')).toBe('@tag.album');
  });

  it('maps extra model types', () => {
    expect(extractTagsFromStoragePath('tenant/scs/logo/logo.svg')).toBe('@tag.logo,@tag.marketing');
    expect(extractTagsFromStoragePath('tenant/scs/theme/bg.png')).toBe('@tag.app');
  });

  it('adds keyword tags', () => {
    expect(extractTagsFromStoragePath('tenant/scs/person/123/avatar')).toBe('@tag.person,@tag.avatar');
    expect(extractTagsFromStoragePath('tenant/scs/address/456/ezs')).toBe('@tag.address,@tag.ezs');
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mocks for external dependencies
vi.mock('@okr/shared-categories', () => ({
  getModelSlug: vi.fn(modelType => `slug-${modelType}`),
}));
vi.mock('@okr/shared-util-core', () => ({
  getPartsOfTupel: vi.fn(fileName => fileName.split('.')),
  isImage: vi.fn((path: string) => /\.(png|jpe?g)$/.test(path)),
  blobToFile: vi.fn((blob, name) => ({ blob, name })),
  die: vi.fn(msg => {
    throw new Error(msg);
  }),
}));

describe('newAvatarModel', () => {
  it('should create a new AvatarModel with correct properties', async () => {
    const { newAvatarModel } = await import('./avatar.util');
    const tenantIds = ['tenant1', 'tenant2'];
    const modelType = 'person';
    const key = 'abc123';
    const fileName = 'avatar.png';
    const result = newAvatarModel(tenantIds, modelType, key, fileName);

    expect(result.okey).toBe('tenant1.person.abc123');
    expect(result.tenants).toEqual(['tenant1', 'tenant2']);
    expect(result.storagePath).toContain('tenant/tenant1/person/abc123/');
    expect(result.isArchived).toBe(false);
  });
});

describe('avatarStorageDir', () => {
  it('should build the tenant directory from the subject key', async () => {
    const { avatarStorageDir } = await import('./avatar.util');
    expect(avatarStorageDir('scs', 'person.abc123')).toBe('tenant/scs/person/abc123/avatar');
  });
});

describe('getAvatarChoices', () => {
  const dir = 'tenant/scs/person/abc123/avatar';

  it('should sort the newest upload first', async () => {
    const { getAvatarChoices } = await import('./avatar.util');
    expect(getAvatarChoices([`${dir}/1770416542221.png`, `${dir}/1787068978704.jpeg`]))
      .toEqual([`${dir}/1787068978704.jpeg`, `${dir}/1770416542221.png`]);
  });

  it('should add the current picture once, also from another directory', async () => {
    const { getAvatarChoices } = await import('./avatar.util');
    const other = 'tenant/p13/person/abc123/avatar/1.png';
    expect(getAvatarChoices([`${dir}/2.png`], `${dir}/2.png`)).toEqual([`${dir}/2.png`]);
    expect(getAvatarChoices([`${dir}/2.png`], other)).toEqual([`${dir}/2.png`, other]);
  });

  it('should ignore files that are not images and an empty current path', async () => {
    const { getAvatarChoices } = await import('./avatar.util');
    expect(getAvatarChoices([`${dir}/1.pdf`, `${dir}/2.png`], '')).toEqual([`${dir}/2.png`]);
    expect(getAvatarChoices([])).toEqual([]);
  });
});

describe('readAsFile', () => {
  const mockBlob = {};

  beforeEach(() => {
    vi.resetModules();
  });

  it('should read file in hybrid platform', async () => {
    vi.mock('@capacitor/filesystem', () => ({
      Filesystem: {
        readFile: vi.fn(async () => ({ data: Buffer.from('test').toString('base64') })),
      },
    }));
    const { readAsFile } = await import('./avatar.util');
    const photo = { path: 'some/path', format: 'png' };
    const platform = { is: vi.fn(type => type === 'hybrid') };

    await readAsFile(photo as any, platform as any);
    expect(platform.is).toHaveBeenCalledWith('hybrid');
  });

  it('should read file in web platform', async () => {
    const { readAsFile } = await import('./avatar.util');
    const photo = { webPath: 'http://test', format: 'jpg' };
    const platform = { is: vi.fn(() => false) };
    global.fetch = vi.fn(async () => ({
      blob: async () => mockBlob,
    })) as any;

    await readAsFile(photo as any, platform as any);
    expect(platform.is).toHaveBeenCalledWith('hybrid');
    expect(global.fetch).toHaveBeenCalledWith('http://test');
  });

  it('should throw error if photo.webPath is missing in web platform', async () => {
    const { readAsFile } = await import('./avatar.util');
    const photo = { format: 'jpg' };
    const platform = { is: vi.fn(() => false) };

    await expect(readAsFile(photo as any, platform as any)).rejects.toThrow();
    // die is already mocked to throw
  });
});

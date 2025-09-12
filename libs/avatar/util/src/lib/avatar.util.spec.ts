import { ModelType } from '@bk2/shared-models';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mocks for external dependencies
vi.mock('@bk2/shared-categories', () => ({
  getModelSlug: vi.fn(modelType => `slug-${modelType}`),
}));
vi.mock('@bk2/shared-util-core', () => ({
  getPartsOfTupel: vi.fn(fileName => fileName.split('.')),
  blobToFile: vi.fn((blob, name) => ({ blob, name })),
  die: vi.fn(msg => {
    throw new Error(msg);
  }),
}));

describe('newAvatarModel', () => {
  it('should create a new AvatarModel with correct properties', async () => {
    const { newAvatarModel } = await import('./avatar.util');
    const tenantIds = ['tenant1', 'tenant2'];
    const modelType = ModelType.Person;
    const key = 'abc123';
    const fileName = 'avatar.png';
    const result = newAvatarModel(tenantIds, modelType, key, fileName);

    expect(result.bkey).toBe(ModelType.Person + '.abc123');
    expect(result.tenants).toEqual(['tenant1', 'tenant2']);
    expect(result.storagePath).toContain('tenant/tenant1/slug-' + ModelType.Person + '/abc123/');
    expect(result.isArchived).toBe(false);
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

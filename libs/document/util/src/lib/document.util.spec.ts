import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Camera, CameraSource } from '@capacitor/camera';
import { Platform } from '@ionic/angular/standalone';
import { getModelSlug } from '@bk2/shared-categories';
import { ModelType } from '@bk2/shared-models';
import { checkUrlType, warn } from '@bk2/shared-util-core';
import { readAsFile } from '@bk2/avatar-util';
import { pickPhoto, getDocumentTitle, checkMimeType, getDocumentStoragePath, getStoragePath } from './document.util';

// Mock all external dependencies
// Replace the simple mock with a factory to define the Camera object structure
vi.mock('@capacitor/camera', () => ({
  Camera: {
    getPhoto: vi.fn(),
  },
  // Re-export the enums so they can be used in the test
  CameraSource: {
    Prompt: 'PROMPT',
    Photos: 'PHOTOS',
  },
  CameraResultType: {
    Uri: 'uri',
  },
}));
vi.mock('@bk2/shared-categories');
vi.mock('@bk2/shared-util-core');
vi.mock('@bk2/avatar-util');

describe('Document Utils', () => {
  const mockGetPhoto = vi.mocked(Camera.getPhoto);
  const mockReadAsFile = vi.mocked(readAsFile);
  const mockGetModelSlug = vi.mocked(getModelSlug);
  const mockWarn = vi.mocked(warn);
  const mockCheckUrlType = vi.mocked(checkUrlType);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('pickPhoto', () => {
    it('should use CameraSource.Prompt on mobile platforms', async () => {
      const mockPlatform = { is: vi.fn().mockReturnValue(true) } as unknown as Platform;
      mockGetPhoto.mockResolvedValue({ webPath: 'fake-path' } as unknown);
      await pickPhoto(mockPlatform);
      expect(mockPlatform.is).toHaveBeenCalledWith('mobile');
      expect(mockGetPhoto).toHaveBeenCalledWith(expect.objectContaining({ source: CameraSource.Prompt }));
    });

    it('should use CameraSource.Photos on non-mobile platforms', async () => {
      const mockPlatform = { is: vi.fn().mockReturnValue(false) } as unknown as Platform;
      mockGetPhoto.mockResolvedValue({ webPath: 'fake-path' } as unknown);
      await pickPhoto(mockPlatform);
      expect(mockPlatform.is).toHaveBeenCalledWith('mobile');
      expect(mockGetPhoto).toHaveBeenCalledWith(expect.objectContaining({ source: CameraSource.Photos }));
    });

    it('should return a file after reading it', async () => {
      const mockPlatform = { is: vi.fn().mockReturnValue(false) } as unknown as Platform;
      const mockPhoto = { webPath: 'fake-path' } as unknown;
      const mockFile = new File([], 'test.jpg');
      mockGetPhoto.mockResolvedValue(mockPhoto);
      mockReadAsFile.mockResolvedValue(mockFile);

      const result = await pickPhoto(mockPlatform);

      expect(mockReadAsFile).toHaveBeenCalledWith(mockPhoto, mockPlatform);
      expect(result).toBe(mockFile);
    });
  });

  describe('getDocumentTitle', () => {
    it('should return the correct translation key for an operation', () => {
      const title = getDocumentTitle('upload');
      expect(title).toBe('document.operation.upload.label');
    });
  });

  describe('checkMimeType', () => {
    it('should return true for any image type', () => {
      expect(checkMimeType('image/jpeg')).toBe(true);
      expect(checkMimeType('image/png')).toBe(true);
    });

    it('should return true for PDF when imagesOnly is false', () => {
      expect(checkMimeType('application/pdf', false)).toBe(true);
    });

    it('should return false for PDF when imagesOnly is true', () => {
      expect(checkMimeType('application/pdf', true)).toBe(false);
    });

    it('should return false for other types', () => {
      expect(checkMimeType('text/plain')).toBe(false);
      expect(checkMimeType('application/json')).toBe(false);
    });
  });

  describe('getDocumentStoragePath', () => {
    it('should return the correct path when all parameters are valid', () => {
      mockGetModelSlug.mockReturnValue('people');
      const path = getDocumentStoragePath('tenant-1', ModelType.Person, 'person-key');
      expect(path).toBe('tenant-1/people/person-key/documents');
      expect(mockGetModelSlug).toHaveBeenCalledWith(ModelType.Person);
    });

    it('should return undefined and warn if modelType is undefined', () => {
      const path = getDocumentStoragePath('tenant-1', undefined as unknown, 'key');
      expect(path).toBeUndefined();
      expect(mockWarn).toHaveBeenCalledWith('document.util.getDocumentStoragePath -> modelType is undefined');
    });

    it('should return undefined and warn if key is undefined', () => {
      const path = getDocumentStoragePath('tenant-1', ModelType.Person);
      expect(path).toBeUndefined();
      expect(mockWarn).toHaveBeenCalledWith('document.util.getDocumentStoragePath -> key is undefined');
    });

    it('should return undefined and warn if tenant is undefined', () => {
      const path = getDocumentStoragePath(undefined as unknown, ModelType.Person, 'key');
      expect(path).toBeUndefined();
      expect(mockWarn).toHaveBeenCalledWith('document.util.getDocumentStoragePath -> tenant is undefined');
    });
  });

  describe('getStoragePath', () => {
    it('should return undefined for a null or empty URL', () => {
      expect(getStoragePath(undefined, ModelType.Person, 'tenant-1')).toBeUndefined();
      expect(getStoragePath('', ModelType.Person, 'tenant-1')).toBeUndefined();
    });

    it('should return the URL directly if its type is "storage"', () => {
      mockCheckUrlType.mockReturnValue('storage');
      const url = 'path/to/storage/file.jpg';
      expect(getStoragePath(url, ModelType.Person, 'tenant-1')).toBe(url);
      expect(mockCheckUrlType).toHaveBeenCalledWith(url);
    });

    it('should generate a storage path if the URL type is "key"', () => {
      mockCheckUrlType.mockReturnValue('key');
      mockGetModelSlug.mockReturnValue('people');
      const key = 'person-123';
      const path = getStoragePath(key, ModelType.Person, 'tenant-1');
      expect(path).toBe('tenant-1/people/person-123/documents');
    });

    it('should return undefined for other URL types like "http"', () => {
      mockCheckUrlType.mockReturnValue('http');
      const url = 'http://example.com/image.jpg';
      expect(getStoragePath(url, ModelType.Person, 'tenant-1')).toBeUndefined();
    });
  });
});

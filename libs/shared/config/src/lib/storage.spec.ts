import { InjectionToken } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { STORAGE, STORAGE_EMULATOR_PORT } from './storage';

describe('STORAGE InjectionToken', () => {
  it('should be defined', () => {
    expect(STORAGE).toBeDefined();
  });

  it('should be an instance of InjectionToken', () => {
    expect(STORAGE instanceof InjectionToken).toBe(true);
  });

  it('should have correct emulator port constant', () => {
    expect(STORAGE_EMULATOR_PORT).toBe(9199);
  });
});

describe('uploadToFirebaseStorage', () => {
  it('should call uploadBytesResumable with correct arguments', async () => {
    vi.mock('firebase/storage', () => {
      const mockRef = vi.fn(() => ({}));
      const mockUploadBytesResumable = vi.fn();
      return {
        ref: mockRef,
        uploadBytesResumable: mockUploadBytesResumable,
        connectStorageEmulator: vi.fn(),
        getStorage: vi.fn(),
      };
    });

    vi.mock('firebase/app', () => ({
      getApp: vi.fn(() => ({})),
    }));

    // Import after mocks are set
    const { uploadToFirebaseStorage } = await import('./storage');
    const path = 'test/path';
    const file = new File(['test'], 'test.txt');
    uploadToFirebaseStorage(path, file);

    // Get mocks from the mocked module
    const storageModule = await import('firebase/storage');
    expect(storageModule.ref).toHaveBeenCalled();
    expect(storageModule.uploadBytesResumable).toHaveBeenCalled();
  });
});

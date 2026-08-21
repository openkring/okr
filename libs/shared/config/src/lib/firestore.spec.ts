import { InjectionToken } from '@angular/core';
import { afterEach, describe, expect, it } from 'vitest';
import { FIRESTORE, FIRESTORE_EMULATOR_PORT, isSafari, isWebStorageAvailable } from './firestore';

describe('isSafari', () => {
  const originalNavigator = global.navigator;

  afterEach(() => {
    global.navigator = originalNavigator;
  });

  it('should return false if navigator is undefined (SSR)', () => {
    (global as unknown as Record<string, unknown>)['navigator'] = undefined;
    expect(isSafari()).toBe(false);
  });

  it('should return true for Safari user agent', () => {
    global.navigator = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Safari/605.1.15' } as unknown as Navigator;
    expect(isSafari()).toBe(true);
  });

  it('should return false for Chrome user agent', () => {
    global.navigator = { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' } as unknown as Navigator;
    expect(isSafari()).toBe(false);
  });

  it('should return false for Chromium user agent', () => {
    global.navigator = { userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chromium/91.0.4472.124 Safari/537.36' } as unknown as Navigator;
    expect(isSafari()).toBe(false);
  });

  it('should return false for Chrome on iOS (CriOS)', () => {
    global.navigator = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/116.0.5845.90 Mobile/15E148 Safari/604.1' } as unknown as Navigator;
    expect(isSafari()).toBe(false);
  });
});

describe('isWebStorageAvailable', () => {
  const originalWindow = (global as unknown as Record<string, unknown>)['window'];

  afterEach(() => {
    (global as unknown as Record<string, unknown>)['window'] = originalWindow;
  });

  const withWindow = (win: unknown) => {
    (global as unknown as Record<string, unknown>)['window'] = win;
  };

  it('should return false when window is undefined (SSR)', () => {
    withWindow(undefined);
    expect(isWebStorageAvailable()).toBe(false);
  });

  it('should return false when reading localStorage throws a SecurityError (SCS-7N)', () => {
    withWindow({
      indexedDB: {},
      get localStorage(): Storage {
        throw new DOMException("Failed to read the 'localStorage' property from 'Window'", 'SecurityError');
      },
    });
    expect(isWebStorageAvailable()).toBe(false);
  });

  it('should return false when writing to localStorage throws', () => {
    withWindow({
      indexedDB: {},
      localStorage: {
        setItem: () => { throw new DOMException('denied', 'SecurityError'); },
        removeItem: () => undefined,
      },
    });
    expect(isWebStorageAvailable()).toBe(false);
  });

  it('should return false when indexedDB is missing', () => {
    withWindow({ indexedDB: undefined, localStorage: { setItem: () => undefined, removeItem: () => undefined } });
    expect(isWebStorageAvailable()).toBe(false);
  });

  it('should return true when localStorage round-trips and indexedDB exists', () => {
    const store = new Map<string, string>();
    withWindow({
      indexedDB: {},
      localStorage: {
        setItem: (k: string, v: string) => { store.set(k, v); },
        removeItem: (k: string) => { store.delete(k); },
      },
    });
    expect(isWebStorageAvailable()).toBe(true);
    expect(store.size).toBe(0);
  });
});

describe('FIRESTORE InjectionToken', () => {
  it('should be defined', () => {
    expect(FIRESTORE).toBeDefined();
  });

  it('should be an instance of InjectionToken', () => {
    expect(FIRESTORE instanceof InjectionToken).toBe(true);
  });

  it('should have correct emulator port constant', () => {
    expect(FIRESTORE_EMULATOR_PORT).toBe(8080);
  });
});

import { InjectionToken } from '@angular/core';
import { afterEach, describe, expect, it } from 'vitest';
import { FIRESTORE, FIRESTORE_EMULATOR_PORT, isSafari } from './firestore';

describe('isSafari', () => {
  const originalNavigator = global.navigator;

  afterEach(() => {
    global.navigator = originalNavigator;
  });

  it('should return false if navigator is undefined (SSR)', () => {
    delete global.navigator;
    expect(isSafari()).toBe(false);
  });

  it('should return true for Safari user agent', () => {
    global.navigator = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Safari/605.1.15' };
    expect(isSafari()).toBe(true);
  });

  it('should return false for Chrome user agent', () => {
    global.navigator = { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' };
    expect(isSafari()).toBe(false);
  });

  it('should return false for Chromium user agent', () => {
    global.navigator = { userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chromium/91.0.4472.124 Safari/537.36' };
    expect(isSafari()).toBe(false);
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

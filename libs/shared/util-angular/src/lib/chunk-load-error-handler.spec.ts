import { ErrorHandler } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOOT_FAILURE_RELOAD_KEY, ChunkLoadErrorHandler, STALE_CHUNK_RELOAD_KEY, forceBootRecovery, isStaleChunkError, recoverFromBootFailure, registerStaleChunkRecovery } from './chunk-load-error-handler';

describe('isStaleChunkError', () => {
  it('matches the per-browser dynamic-import failure messages', () => {
    expect(isStaleChunkError(new Error('error loading dynamically imported module: https://x/src-AB12.js'))).toBe(true);
    expect(isStaleChunkError(new Error('Failed to fetch dynamically imported module: https://x/src-AB12.js'))).toBe(true);
    expect(isStaleChunkError(new Error('Importing a module script failed.'))).toBe(true);
    expect(isStaleChunkError('error loading dynamically imported module')).toBe(true);
  });

  it('matches the MIME-type wording emitted when the SPA rewrite serves index.html (SCS-1A)', () => {
    // Safari/WebKit — the chunk request resolved to the index.html fallback (text/html).
    expect(isStaleChunkError(new Error("'text/html' is not a valid JavaScript MIME type."))).toBe(true);
    // Chrome/V8 — same failure, different wording.
    expect(
      isStaleChunkError(
        new Error(
          'Failed to load module script: Expected a JavaScript module script but the server responded with a MIME type of "text/html".',
        ),
      ),
    ).toBe(true);
  });

  it('ignores unrelated errors', () => {
    expect(isStaleChunkError(new Error('Cannot read properties of undefined'))).toBe(false);
    expect(isStaleChunkError(null)).toBe(false);
    expect(isStaleChunkError(undefined)).toBe(false);
    expect(isStaleChunkError({})).toBe(false);
  });
});

describe('ChunkLoadErrorHandler', () => {
  const reload = vi.fn();
  let delegate: ErrorHandler;

  beforeEach(() => {
    sessionStorage.clear();
    reload.mockClear();
    // jsdom's location.reload is a non-configurable no-op; swap it for a spy.
    Object.defineProperty(window, 'location', { value: { reload }, writable: true, configurable: true });
    delegate = { handleError: vi.fn() };
  });

  afterEach(() => vi.restoreAllMocks());

  it('reloads once on a stale-chunk error and does NOT forward it to the delegate', () => {
    const handler = new ChunkLoadErrorHandler(delegate);
    handler.handleError(new Error('error loading dynamically imported module: https://x/src-AB12.js'));
    expect(reload).toHaveBeenCalledTimes(1);
    expect(delegate.handleError).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(STALE_CHUNK_RELOAD_KEY)).not.toBeNull();
  });

  it('does not reload a second time within the guard window; forwards the repeat to the delegate', () => {
    const handler = new ChunkLoadErrorHandler(delegate);
    const err = new Error('Failed to fetch dynamically imported module: https://x/src-AB12.js');
    handler.handleError(err);
    handler.handleError(err);
    expect(reload).toHaveBeenCalledTimes(1);
    // The second (post-reload) failure is a genuinely broken deploy → Sentry should see it.
    expect(delegate.handleError).toHaveBeenCalledTimes(1);
    expect(delegate.handleError).toHaveBeenCalledWith(err);
  });

  it('forwards non-chunk errors to the delegate and never reloads', () => {
    const handler = new ChunkLoadErrorHandler(delegate);
    const err = new Error('boom');
    handler.handleError(err);
    expect(reload).not.toHaveBeenCalled();
    expect(delegate.handleError).toHaveBeenCalledWith(err);
  });
});

describe('registerStaleChunkRecovery', () => {
  const reload = vi.fn();

  /** Dispatch an unhandledrejection-shaped event; jsdom does not synthesise one for us. */
  function rejectWith(reason: unknown): Event & { defaultPrevented: boolean } {
    const event = new Event('unhandledrejection', { cancelable: true });
    Object.defineProperty(event, 'reason', { value: reason });
    window.dispatchEvent(event);
    return event as Event & { defaultPrevented: boolean };
  }

  beforeEach(() => {
    sessionStorage.clear();
    reload.mockClear();
    Object.defineProperty(window, 'location', { value: { reload }, writable: true, configurable: true });
  });

  afterEach(() => vi.restoreAllMocks());

  it('reloads on a stale-chunk rejection that never reached Angular ErrorHandler (SCS-1N)', () => {
    registerStaleChunkRecovery();
    const event = rejectWith(new Error('Failed to fetch dynamically imported module: https://x/src-AB12.js'));
    expect(reload).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it('leaves unrelated rejections alone', () => {
    registerStaleChunkRecovery();
    const event = rejectWith(new Error('boom'));
    expect(reload).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });
});

describe('recoverFromBootFailure', () => {
  const reload = vi.fn();

  beforeEach(() => {
    sessionStorage.clear();
    reload.mockClear();
    Object.defineProperty(window, 'location', { value: { reload }, writable: true, configurable: true });
  });

  afterEach(() => vi.restoreAllMocks());

  it('reloads once and stamps its own guard key', () => {
    expect(recoverFromBootFailure()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(BOOT_FAILURE_RELOAD_KEY)).not.toBeNull();
  });

  it('does not reload again within the guard window — the retry is the user\'s from there on', () => {
    recoverFromBootFailure();
    expect(recoverFromBootFailure()).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('uses a guard key separate from the stale-chunk one, so a boot failure still gets its retry', () => {
    sessionStorage.setItem(STALE_CHUNK_RELOAD_KEY, String(Date.now()));
    expect(recoverFromBootFailure()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('degrades to no auto-retry when sessionStorage access throws (SCS-7N)', () => {
    // Chrome throws SecurityError on the property access itself when site data is blocked —
    // the very environment this recovery path exists for. It must not throw out of the screen.
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Access is denied for this document.', 'SecurityError');
    });
    expect(recoverFromBootFailure()).toBe(false);
    expect(reload).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('forceBootRecovery', () => {
  const reload = vi.fn();

  beforeEach(() => {
    sessionStorage.clear();
    reload.mockClear();
    Object.defineProperty(window, 'location', { value: { reload }, writable: true, configurable: true });
  });

  afterEach(() => vi.restoreAllMocks());

  it('clears the guard, unregisters service workers, drops caches and reloads', async () => {
    sessionStorage.setItem(BOOT_FAILURE_RELOAD_KEY, String(Date.now()));
    const unregister = vi.fn().mockResolvedValue(true);
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { getRegistrations: vi.fn().mockResolvedValue([{ unregister }]) },
      configurable: true,
    });
    const cacheDelete = vi.fn().mockResolvedValue(true);
    Object.defineProperty(window, 'caches', {
      value: { keys: vi.fn().mockResolvedValue(['ngsw:1']), delete: cacheDelete },
      configurable: true,
    });

    await forceBootRecovery();

    expect(sessionStorage.getItem(BOOT_FAILURE_RELOAD_KEY)).toBeNull();
    expect(unregister).toHaveBeenCalledTimes(1);
    expect(cacheDelete).toHaveBeenCalledWith('ngsw:1');
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('still reloads when the storage APIs are unavailable or denied', async () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { getRegistrations: vi.fn().mockRejectedValue(new DOMException('denied', 'SecurityError')) },
      configurable: true,
    });
    Object.defineProperty(window, 'caches', {
      value: { keys: vi.fn().mockRejectedValue(new Error('denied')), delete: vi.fn() },
      configurable: true,
    });

    await forceBootRecovery();

    expect(reload).toHaveBeenCalledTimes(1);
  });
});

import { ErrorHandler } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChunkLoadErrorHandler, STALE_CHUNK_RELOAD_KEY, isStaleChunkError } from './chunk-load-error-handler';

describe('isStaleChunkError', () => {
  it('matches the per-browser dynamic-import failure messages', () => {
    expect(isStaleChunkError(new Error('error loading dynamically imported module: https://x/src-AB12.js'))).toBe(true);
    expect(isStaleChunkError(new Error('Failed to fetch dynamically imported module: https://x/src-AB12.js'))).toBe(true);
    expect(isStaleChunkError(new Error('Importing a module script failed.'))).toBe(true);
    expect(isStaleChunkError('error loading dynamically imported module')).toBe(true);
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

import { describe, expect, it } from 'vitest';

import { describeUploadError, isRetryableUploadError } from './upload-error.util';

/**
 * Stand-in for a real `FirebaseError`: the fields the SDK sets are non-enumerable, which is
 * precisely what defeated the old `JSON.stringify(ex)` reporting. The test asserts the
 * regression directly — if `describeUploadError` ever went back to enumerating own keys, the
 * first expectation below would fail.
 */
function firebaseError(code: string, message: string): Error {
  const ex = new Error(message);
  Object.defineProperty(ex, 'code', { value: code, enumerable: false });
  return ex;
}

describe('describeUploadError', () => {
  it('reads code and message off a FirebaseError whose fields are non-enumerable', () => {
    const ex = firebaseError('storage/unauthorized', 'User does not have permission.');

    expect(JSON.stringify(ex)).toBe('{}');   // the bug this helper exists for
    expect(describeUploadError(ex)).toEqual({
      code: 'storage/unauthorized',
      message: 'User does not have permission.',
    });
  });

  it('reads status and serverResponse off prototype getters, like StorageError has them', () => {
    class FakeStorageError extends Error {
      public readonly code = 'storage/unknown';
      private readonly customData = { serverResponse: '{"error":{"code":412}}' };
      public get status(): number { return 412; }
      public get serverResponse(): string { return this.customData.serverResponse; }
    }
    expect(describeUploadError(new FakeStorageError('unknown error'))).toEqual({
      code: 'storage/unknown',
      message: 'unknown error',
      status: 412,
      serverResponse: '{"error":{"code":412}}',
    });
  });

  it('keeps a 0 status but omits an empty serverResponse', () => {
    const ex = firebaseError('storage/unknown', 'no reply');
    Object.defineProperty(ex, 'status', { value: 0, enumerable: false });
    Object.defineProperty(ex, 'serverResponse', { value: null, enumerable: false });
    expect(describeUploadError(ex)).toEqual({ code: 'storage/unknown', message: 'no reply', status: 0 });
  });

  it('falls back to `unknown` when there is no code', () => {
    expect(describeUploadError(new Error('boom'))).toEqual({ code: 'unknown', message: 'boom' });
  });

  it('accepts a bare string rejection', () => {
    expect(describeUploadError('nope')).toEqual({ code: 'unknown', message: 'nope' });
  });

  it('survives null, undefined and primitives without throwing', () => {
    expect(describeUploadError(null).code).toBe('unknown');
    expect(describeUploadError(undefined).code).toBe('unknown');
    expect(describeUploadError(42).message).toBe('42');
  });

  it('uses the error name when the message is empty', () => {
    const ex = new Error('');
    ex.name = 'AbortError';
    expect(describeUploadError(ex).message).toBe('AbortError');
  });
});

describe('isRetryableUploadError', () => {
  it('retries a stale-token denial and a dropped connection', () => {
    expect(isRetryableUploadError('storage/unauthorized')).toBe(true);
    expect(isRetryableUploadError('storage/retry-limit-exceeded')).toBe(true);
    expect(isRetryableUploadError('storage/unknown')).toBe(true);
    expect(isRetryableUploadError('storage/unauthorized-app')).toBe(true);
  });

  it('does not retry a full bucket, a cancellation or an expired session', () => {
    expect(isRetryableUploadError('storage/quota-exceeded')).toBe(false);
    expect(isRetryableUploadError('storage/canceled')).toBe(false);
    expect(isRetryableUploadError('storage/unauthenticated')).toBe(false);
    expect(isRetryableUploadError('unknown')).toBe(false);
  });
});

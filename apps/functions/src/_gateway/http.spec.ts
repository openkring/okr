// apps/functions/src/_gateway/http.spec.ts
import { describe, it, expect } from 'vitest';
import { isRetryableStatus } from './http';

describe('isRetryableStatus', () => {
  it('retries 429 and 5xx', () => {
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(500)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
  });
  it('does not retry 4xx (except 429)', () => {
    expect(isRetryableStatus(400)).toBe(false);
    expect(isRetryableStatus(401)).toBe(false);
    expect(isRetryableStatus(404)).toBe(false);
  });
  it('does not retry 2xx/3xx', () => {
    expect(isRetryableStatus(200)).toBe(false);
    expect(isRetryableStatus(304)).toBe(false);
  });
  it('retries when status is undefined (transport error)', () => {
    expect(isRetryableStatus(undefined)).toBe(true);
  });
});

import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifyHmacHex } from './verify';

const secret = 's3cret';
const body = Buffer.from('{"a":1}');
const good = createHmac('sha256', secret).update(body).digest('hex');

describe('verifyHmacHex', () => {
  it('accepts the correct digest', () => {
    expect(verifyHmacHex(body, good, secret)).toBe(true);
  });
  it('rejects a wrong digest', () => {
    expect(verifyHmacHex(body, createHmac('sha256', 'x').update(body).digest('hex'), secret)).toBe(false);
  });
  it('rejects degenerate input without throwing', () => {
    expect(verifyHmacHex(body, undefined, secret)).toBe(false);
    expect(verifyHmacHex(undefined, good, secret)).toBe(false);
    expect(verifyHmacHex(body, good, '')).toBe(false);
    expect(verifyHmacHex(body, 'not hex at all', secret)).toBe(false);
    expect(verifyHmacHex(body, 'abcd', secret)).toBe(false);
  });
});

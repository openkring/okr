import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifyHmacHex, verifyStripeSignature } from './verify';

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
  it('rejects a valid digest followed by junk', () => {
    expect(verifyHmacHex(body, good + 'zz', secret)).toBe(false);
    expect(verifyHmacHex(body, good + 'ab', secret)).toBe(false);
  });
});

describe('verifyStripeSignature', () => {
  const whsec = 'whsec_test';
  const t = 1_700_000_000;
  const sig = (ts: number, b: Buffer, key = whsec) =>
    createHmac('sha256', key).update(`${ts}.${b.toString('utf8')}`).digest('hex');
  const ok = sig(t, body);

  it('accepts a valid signature', () => {
    expect(verifyStripeSignature(body, `t=${t},v1=${ok}`, whsec, t + 10, 300)).toBe(true);
  });
  it('accepts when any v1 matches and ignores v0', () => {
    const bad = sig(t, body, 'other');
    expect(verifyStripeSignature(body, `t=${t},v1=${bad},v0=abc,v1=${ok}`, whsec, t, 300)).toBe(true);
  });
  it('rejects a tampered body', () => {
    expect(verifyStripeSignature(Buffer.from('{"a":2}'), `t=${t},v1=${ok}`, whsec, t, 300)).toBe(false);
  });
  it('rejects outside the tolerance, both directions', () => {
    expect(verifyStripeSignature(body, `t=${t},v1=${ok}`, whsec, t + 301, 300)).toBe(false);
    expect(verifyStripeSignature(body, `t=${t},v1=${ok}`, whsec, t - 301, 300)).toBe(false);
    expect(verifyStripeSignature(body, `t=${t},v1=${ok}`, whsec, t + 300, 300)).toBe(true);
  });
  it('rejects a missing t or v1', () => {
    expect(verifyStripeSignature(body, `v1=${ok}`, whsec, t, 300)).toBe(false);
    expect(verifyStripeSignature(body, `t=${t}`, whsec, t, 300)).toBe(false);
    expect(verifyStripeSignature(body, `t=${t},v0=${ok}`, whsec, t, 300)).toBe(false);
  });
  it('rejects non-hex or wrong-length v1 and degenerate input', () => {
    expect(verifyStripeSignature(body, `t=${t},v1=${'z'.repeat(64)}`, whsec, t, 300)).toBe(false);
    expect(verifyStripeSignature(body, `t=${t},v1=abcd`, whsec, t, 300)).toBe(false);
    expect(verifyStripeSignature(body, `t=abc,v1=${ok}`, whsec, t, 300)).toBe(false);
    expect(verifyStripeSignature(undefined, `t=${t},v1=${ok}`, whsec, t, 300)).toBe(false);
    expect(verifyStripeSignature(body, undefined, whsec, t, 300)).toBe(false);
    expect(verifyStripeSignature(body, `t=${t},v1=${ok}`, '', t, 300)).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { fcmTokenDocId } from './fcm-token.util';

describe('fcmTokenDocId', () => {
  it('keeps a short token unchanged', () => expect(fcmTokenDocId('abc:def')).toBe('abc:def'));
  it('cuts a 163-char web token to 128', () => {
    const t = 'x'.repeat(163);
    expect(fcmTokenDocId(t)).toBe('x'.repeat(128));
  });
});

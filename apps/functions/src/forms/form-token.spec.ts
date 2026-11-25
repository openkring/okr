import { describe, expect, it } from 'vitest';

import { buildToken, verifyToken } from './form-token';

const SECRET = 'test-secret';
const NOW = Date.parse('2026-11-25T10:00:00Z');
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

describe('form token', () => {
  const token = buildToken('mitgliedschaft-beantragen', SECRET, NOW);

  it('accepts a fresh token', () => {
    expect(verifyToken(token, SECRET, NOW + MINUTE)).toEqual({ valid: true });
  });

  it('accepts a slow filler: 31 minutes, the next day, six days later', () => {
    for (const age of [31 * MINUTE, DAY, 6 * DAY]) {
      expect(verifyToken(token, SECRET, NOW + age), `age ${age}`).toEqual({ valid: true });
    }
  });

  it('refuses a token older than seven days', () => {
    expect(verifyToken(token, SECRET, NOW + 7 * DAY + 1)).toEqual({ valid: false, reason: 'expired' });
  });

  it('refuses a forged signature, whatever its age', () => {
    const forged = buildToken('mitgliedschaft-beantragen', 'other-secret', NOW);
    expect(verifyToken(forged, SECRET, NOW + MINUTE)).toEqual({ valid: false, reason: 'invalid_sig' });
    expect(verifyToken(forged, SECRET, NOW + 8 * DAY)).toEqual({ valid: false, reason: 'invalid_sig' });
  });

  it('refuses a token whose time was moved forward', () => {
    const [formKey, , sig] = Buffer.from(token, 'base64url').toString('utf8').split(':');
    const moved = Buffer.from(`${formKey}:${NOW + 30 * DAY}:${sig}`).toString('base64url');
    expect(verifyToken(moved, SECRET, NOW + 30 * DAY)).toEqual({ valid: false, reason: 'invalid_sig' });
  });

  it('refuses what is no token', () => {
    for (const junk of ['', 'abc', Buffer.from('a:b').toString('base64url')]) {
      expect(verifyToken(junk, SECRET, NOW)).toEqual({ valid: false, reason: 'malformed' });
    }
    const noTime = Buffer.from('form:never:sig').toString('base64url');
    expect(verifyToken(noTime, SECRET, NOW).valid).toBe(false);
  });
});

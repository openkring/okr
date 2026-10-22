import { describe, expect, it } from 'vitest';

import { hashPassword, hashToken, newToken, verifyPassword } from './file-transfer-tokens';

describe('file-transfer-tokens', () => {
  it('hashToken is deterministic and 64 hex chars', () => {
    const h = hashToken('abc');
    expect(h).toBe(hashToken('abc'));
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken('abd')).not.toBe(h);
  });

  it('newToken returns distinct base64url tokens of 32 random bytes', () => {
    const a = newToken();
    const b = newToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('verifies the right password and rejects a wrong one', async () => {
    const stored = await hashPassword('Geheim 123');
    expect(stored).toMatch(/^[0-9a-f]+:[0-9a-f]+$/);
    expect(await verifyPassword('Geheim 123', stored)).toBe(true);
    expect(await verifyPassword('geheim 123', stored)).toBe(false);
  });

  it('salts every hash', async () => {
    expect(await hashPassword('pw')).not.toBe(await hashPassword('pw'));
  });

  it('rejects a malformed stored hash instead of throwing', async () => {
    expect(await verifyPassword('pw', '')).toBe(false);
    expect(await verifyPassword('pw', 'nohash')).toBe(false);
    expect(await verifyPassword('pw', 'ab:cd')).toBe(false);
  });
});

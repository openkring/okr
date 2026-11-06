import { describe, it, expect } from 'vitest';
import { WEBHOOK_CLIENTS, findClient } from './clients';

describe('WEBHOOK_CLIENTS', () => {
  it('declares every client completely, with a unique id', () => {
    const ids = WEBHOOK_CLIENTS.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of WEBHOOK_CLIENTS) {
      expect(c.id).not.toBe('');
      expect(c.type).not.toBe('');
      expect(c.maxBodyBytes).toBeGreaterThan(0);
      expect(c.retentionDays).toBe(30);
    }
  });
  it('findClient returns undefined for an unknown id', () => {
    expect(findClient('no-such-client')).toBeUndefined();
  });
});

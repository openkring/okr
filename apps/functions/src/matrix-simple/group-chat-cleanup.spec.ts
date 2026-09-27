import { describe, expect, it } from 'vitest';

import { sameTenants } from './group-chat-cleanup';

describe('sameTenants', () => {
  it('treats identical lists as equal regardless of order', () => {
    expect(sameTenants(['scs', 'p13'], ['p13', 'scs'])).toBe(true);
  });

  it('detects an added or removed tenant', () => {
    expect(sameTenants(['scs'], ['scs', 'p13'])).toBe(false);
    expect(sameTenants(['scs', 'p13'], ['scs'])).toBe(false);
  });

  it('detects a swapped tenant of the same length', () => {
    // The length check alone would pass this — the element comparison is what catches a detach
    // that immediately re-attaches elsewhere.
    expect(sameTenants(['scs'], ['p13'])).toBe(false);
  });

  it('treats two empty lists as equal', () => {
    expect(sameTenants([], [])).toBe(true);
  });
});

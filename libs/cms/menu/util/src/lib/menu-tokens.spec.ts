import { describe, expect, it } from 'vitest';

import { expandMenuTokens } from './menu-tokens';

const ctx = { version: '4.2.0' };

describe('expandMenuTokens', () => {
  it('replaces @VERSION@ with v + version', () => {
    expect(expandMenuTokens('@VERSION@', ctx)).toBe('v4.2.0');
  });

  it('replaces a token embedded in surrounding text', () => {
    expect(expandMenuTokens('App @VERSION@', ctx)).toBe('App v4.2.0');
  });

  it('replaces every occurrence of a token', () => {
    expect(expandMenuTokens('@VERSION@ / @VERSION@', ctx)).toBe('v4.2.0 / v4.2.0');
  });

  it('leaves unknown tokens untouched', () => {
    expect(expandMenuTokens('@UNKNOWN@', ctx)).toBe('@UNKNOWN@');
  });

  it('returns a token-free label unchanged', () => {
    expect(expandMenuTokens('Home', ctx)).toBe('Home');
  });
});

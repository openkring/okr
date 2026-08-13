import { describe, expect, it } from 'vitest';

import { expandMenuTokens, resolveMenuLabelKey } from './menu-tokens';

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

describe('resolveMenuLabelKey', () => {
  it('scopes a bare key to the menu scope', () => {
    expect(resolveMenuLabelKey('@home', ctx)).toBe('@cms/menu/feature.home');
  });

  it('leaves an already-scoped key untouched (SCS-47)', () => {
    expect(resolveMenuLabelKey('@system/workflow/feature.plural', ctx))
      .toBe('@system/workflow/feature.plural');
  });

  it('expands tokens instead of scoping them', () => {
    expect(resolveMenuLabelKey('@VERSION@', ctx)).toBe('v4.2.0');
  });

  it('returns a plain label unchanged', () => {
    expect(resolveMenuLabelKey('Home', ctx)).toBe('Home');
  });
});

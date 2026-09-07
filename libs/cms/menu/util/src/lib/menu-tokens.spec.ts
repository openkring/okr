import { describe, expect, it } from 'vitest';

import { expandMenuTokens, getRepoUrl, resolveMenuLabelKey, resolveMenuUrl } from './menu-tokens';

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

describe('getRepoUrl', () => {
  it('builds the github base url from org and repo', () => {
    expect(getRepoUrl('openkring', 'okr')).toBe('https://github.com/openkring/okr');
  });

  it('returns an empty string when a coordinate is missing', () => {
    // app-config defaults both to '' — a half-formed 'https://github.com//' must never be opened
    expect(getRepoUrl('', 'okr')).toBe('');
    expect(getRepoUrl('openkring', '')).toBe('');
    expect(getRepoUrl(undefined, undefined)).toBe('');
  });
});

describe('resolveMenuUrl', () => {
  const urlCtx = { version: '4.2.0', repoUrl: 'https://github.com/openkring/okr' };

  it('expands @REPO_URL@ into the commits url of the configured repository', () => {
    expect(resolveMenuUrl('@REPO_URL@/commits/main/', urlCtx))
      .toBe('https://github.com/openkring/okr/commits/main/');
  });

  it('leaves a token-free url unchanged', () => {
    expect(resolveMenuUrl('https://example.com/x', urlCtx)).toBe('https://example.com/x');
  });

  it('expands @REPO_URL@ to an empty string when no repo is configured', () => {
    expect(resolveMenuUrl('@REPO_URL@/commits/main/', { version: '4.2.0' })).toBe('/commits/main/');
  });

  it('expands @TID@ so one shared document serves every tenant', () => {
    expect(resolveMenuUrl('/album/@TID@-album/c-album', { ...urlCtx, tenantId: 'p13' }))
      .toBe('/album/p13-album/c-album');
    expect(resolveMenuUrl('/album/@TID@-album/c-album', { ...urlCtx, tenantId: 'scs' }))
      .toBe('/album/scs-album/c-album');
  });

  it('expands @TID@ more than once in the same url', () => {
    expect(resolveMenuUrl('/private/@TID@/x/@TID@', { ...urlCtx, tenantId: 'okr' }))
      .toBe('/private/okr/x/okr');
  });

  it('expands @TID@ to an empty string when no tenant is known', () => {
    // Same degradation @REPO_URL@ already has: an unresolved token leaves a broken path
    // rather than routing to the literal '@TID@'.
    expect(resolveMenuUrl('/album/@TID@-album/c-album', { version: '4.2.0' }))
      .toBe('/album/-album/c-album');
  });
});

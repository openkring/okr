import { describe, expect, it } from 'vitest';

import { AppConfig } from '@okr/shared-models';

import { expandMenuTokens, getIssueUrl, getRepoUrl, getWebDomain, lacksTokenValue, resolveMenuLabelKey, resolveMenuUrl } from './menu-tokens';

const ctx = { version: '4.2.0' };

describe('expandMenuTokens', () => {
  it('replaces @VERSION@ with v + version', () => {
    expect(expandMenuTokens('@VERSION@', ctx)).toBe('v4.2.0');
  });

  it('appends the release date to @VERSION@ when there is one', () => {
    expect(expandMenuTokens('Release @VERSION@', { ...ctx, releaseDate: '05.11.2026' })).toBe('Release v4.2.0/05.11.2026');
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

  it('replaces @TID_UPPER@ with the upper-cased tenant id (accounting sub-menu title)', () => {
    expect(expandMenuTokens('@TID_UPPER@ Buchhaltung', { ...ctx, tenantId: 'scs' })).toBe('SCS Buchhaltung');
  });

  it('expands @TID_UPPER@ to nothing when no tenant is in scope', () => {
    expect(expandMenuTokens('@TID_UPPER@ Buchhaltung', ctx)).toBe(' Buchhaltung');
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

describe('@BOOKS@ — the default books, never the app tenant', () => {
  it('@BOOKS@ / @BOOKS_UPPER@ expand to the configured books, independent of the tenant', () => {
    const c = { ...ctx, tenantId: 'scs', booksId: 'gss' };
    expect(resolveMenuUrl('/accounting/@BOOKS@/journal/c-journal', c)).toBe('/accounting/gss/journal/c-journal');
    expect(expandMenuTokens('@BOOKS_UPPER@ Buchhaltung', c)).toBe('GSS Buchhaltung');
    expect(resolveMenuUrl('/album/@TID@-album/c-album', c)).toBe('/album/scs-album/c-album');
  });
  it('lacksTokenValue: a text that needs books while none are configured', () => {
    expect(lacksTokenValue('/accounting/@BOOKS@/journal', { ...ctx, tenantId: 'bkg', booksId: '' })).toBe(true);
    expect(lacksTokenValue('@BOOKS_UPPER@ Buchhaltung', { ...ctx, tenantId: 'bkg' })).toBe(true);
    expect(lacksTokenValue('/accounting/@BOOKS@/journal', { ...ctx, booksId: 'scs' })).toBe(false);
    expect(lacksTokenValue('/album/@TID@-album', { ...ctx, booksId: '' })).toBe(false);
  });
});

describe('@APP_DOMAIN@ / @WEB_DOMAIN@ — the two sitemap rows', () => {
  it('expands the app host and the website host derived from it', () => {
    const c = { ...ctx, appDomain: 'app.seeclub.org' };
    expect(expandMenuTokens('Sitemap @APP_DOMAIN@', c)).toBe('Sitemap app.seeclub.org');
    expect(expandMenuTokens('Sitemap @WEB_DOMAIN@', c)).toBe('Sitemap www.seeclub.org');
  });
  it('getWebDomain: apex and www both map to www, empty stays empty', () => {
    expect(getWebDomain('seeclub.org')).toBe('www.seeclub.org');
    expect(getWebDomain('www.seeclub.org')).toBe('www.seeclub.org');
    expect(getWebDomain(' App.Kring.ch ')).toBe('www.kring.ch');
    expect(getWebDomain('')).toBe('');
    expect(getWebDomain(undefined)).toBe('');
  });
  it('getWebDomain: an app on its built-in Firebase host maps to the website site, never to www.<app host>', () => {
    expect(getWebDomain('la21staefa-app-54aef.web.app')).toBe('la21staefa-website-54aef.web.app');
    expect(getWebDomain('la21staefa-app-54aef.firebaseapp.com')).toBe('la21staefa-website-54aef.web.app');
  });
  it('expands to an empty host when the app has no domain', () => {
    expect(expandMenuTokens('Sitemap @WEB_DOMAIN@', ctx).trim()).toBe('Sitemap');
  });
});

describe('@ISSUE_URL@ — the page for reporting errors', () => {
  it('expands to the issue url of the context', () => {
    expect(expandMenuTokens('@ISSUE_URL@', { ...ctx, issueUrl: 'https://github.com/openkring/okr/issues/new' }))
      .toBe('https://github.com/openkring/okr/issues/new');
    expect(resolveMenuUrl('@ISSUE_URL@?labels=bug', { ...ctx, issueUrl: 'https://x.ch/new' })).toBe('https://x.ch/new?labels=bug');
  });
  it('expands to nothing when absent', () => {
    expect(expandMenuTokens('@ISSUE_URL@', ctx)).toBe('');
  });
  it('lacksTokenValue: a row that needs the issue url while there is none', () => {
    expect(lacksTokenValue('@ISSUE_URL@', ctx)).toBe(true);
    expect(lacksTokenValue('@ISSUE_URL@', { ...ctx, issueUrl: '', booksId: 'scs' })).toBe(true);
    expect(lacksTokenValue('@ISSUE_URL@', { ...ctx, issueUrl: 'https://x.ch' })).toBe(false);
    // each token looks at its own value only
    expect(lacksTokenValue('/accounting/@BOOKS@/journal', { ...ctx, issueUrl: 'https://x.ch' })).toBe(true);
    expect(lacksTokenValue('/accounting/@BOOKS@/journal', { ...ctx, booksId: 'scs' })).toBe(false);
    // tokens without a hide rule never hide a row
    expect(lacksTokenValue('@REPO_URL@/commits/main/', ctx)).toBe(false);
  });
});

describe('getIssueUrl', () => {
  it('returns a https url, trimmed', () => {
    expect(getIssueUrl(' https://github.com/openkring/okr/issues/new ')).toBe('https://github.com/openkring/okr/issues/new');
  });
  it('is empty for anything that is not https', () => {
    for (const url of [undefined, null, '', ' ', 5, 'http://x.ch', 'javascript:alert(1)', 'www.x.ch', '/issues', 'https://']) {
      expect(getIssueUrl(url)).toBe('');
    }
  });
  it('is empty for the AppConfig class default of a document without git coordinates', () => {
    expect(new AppConfig('scs').issueUrl).toBe('https://github.com///issues/new');
    expect(getIssueUrl(new AppConfig('scs').issueUrl)).toBe('');
    expect(getIssueUrl('https://github.com/openkring//issues/new')).toBe('');
  });
});

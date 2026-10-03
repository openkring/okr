import { describe, expect, it } from 'vitest';
import { appLinkOrigins, getDeepLinkPath, getSafeEmbedUrl, getSafeReturnUrl, isWebOrigin, publicAppOrigin, resolveAppOrigin } from './url.util';

describe('url.util', () => {
  describe('getSafeEmbedUrl', () => {
    it('accepts https URLs on allowlisted hosts', () => {
      expect(getSafeEmbedUrl('https://www.youtube.com/embed/dQw4w9WgXcQ'))
        .toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
      expect(getSafeEmbedUrl('https://player.vimeo.com/video/12345'))
        .toBe('https://player.vimeo.com/video/12345');
      expect(getSafeEmbedUrl('https://www.openstreetmap.org/export/embed.html'))
        .toBe('https://www.openstreetmap.org/export/embed.html');
    });

    it('preserves query parameters', () => {
      expect(getSafeEmbedUrl('https://www.youtube.com/embed/abc?autoplay=1'))
        .toBe('https://www.youtube.com/embed/abc?autoplay=1');
    });

    it('rejects javascript: and data: URLs', () => {
      expect(getSafeEmbedUrl('javascript:alert(1)')).toBeNull();
      expect(getSafeEmbedUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
    });

    it('rejects http: (non-TLS) URLs', () => {
      expect(getSafeEmbedUrl('http://www.youtube.com/embed/abc')).toBeNull();
    });

    it('rejects hosts that are not on the allowlist', () => {
      expect(getSafeEmbedUrl('https://evil.com/embed')).toBeNull();
      // look-alike host must not pass
      expect(getSafeEmbedUrl('https://youtube.com.evil.com/embed')).toBeNull();
    });

    it('returns null for empty / malformed input', () => {
      expect(getSafeEmbedUrl('')).toBeNull();
      expect(getSafeEmbedUrl(undefined)).toBeNull();
      expect(getSafeEmbedUrl('not a url')).toBeNull();
    });

    it('honors a custom host allowlist', () => {
      expect(getSafeEmbedUrl('https://maps.example.com/x', ['maps.example.com']))
        .toBe('https://maps.example.com/x');
      expect(getSafeEmbedUrl('https://www.youtube.com/embed/x', ['maps.example.com']))
        .toBeNull();
    });
  });

  describe('getDeepLinkPath', () => {
    it('returns the in-app path of an https universal link', () => {
      expect(getDeepLinkPath('https://seeclub.org/album/xyz')).toBe('/album/xyz');
    });

    it('keeps query string and fragment', () => {
      expect(getDeepLinkPath('https://seeclub.org/album/xyz?page=2#top')).toBe('/album/xyz?page=2#top');
    });

    it('ignores the host, so a foreign origin cannot redirect the app', () => {
      expect(getDeepLinkPath('https://evil.com/album/xyz')).toBe('/album/xyz');
    });

    it('resolves a custom-scheme link', () => {
      expect(getDeepLinkPath('org.bkaiser.scs://album/xyz')).toBe('/album/xyz');
      expect(getDeepLinkPath('org.bkaiser.scs:///album/xyz')).toBe('/album/xyz');
    });

    it('rejects http, protocol-relative and non-URL input', () => {
      expect(getDeepLinkPath('http://seeclub.org/album/xyz')).toBeNull();
      expect(getDeepLinkPath('https://seeclub.org//evil.com')).toBeNull();
      expect(getDeepLinkPath('not a url')).toBeNull();
      expect(getDeepLinkPath('')).toBeNull();
      expect(getDeepLinkPath(undefined)).toBeNull();
    });

    it('rejects the bare root, which carries no destination', () => {
      expect(getDeepLinkPath('https://seeclub.org/')).toBeNull();
      expect(getDeepLinkPath('org.bkaiser.scs://')).toBeNull();
    });

    it('rejects the excluded hosting prefixes', () => {
      expect(getDeepLinkPath('https://seeclub.org/web/news')).toBeNull();
      expect(getDeepLinkPath('https://seeclub.org/__/auth/action?mode=resetPassword')).toBeNull();
      expect(getDeepLinkPath('https://seeclub.org/.well-known/apple-app-site-association')).toBeNull();
    });
  });

  describe('getSafeReturnUrl', () => {
    it('accepts a relative in-app route', () => {
      expect(getSafeReturnUrl('/album/xyz')).toBe('/album/xyz');
      expect(getSafeReturnUrl('/album/xyz?page=2#top')).toBe('/album/xyz?page=2#top');
    });

    it('falls back (null) when there is no returnUrl', () => {
      expect(getSafeReturnUrl(undefined)).toBeNull();
      expect(getSafeReturnUrl(null)).toBeNull();
      expect(getSafeReturnUrl('')).toBeNull();
      expect(getSafeReturnUrl('/')).toBeNull();
    });

    // The value arrives through the address bar, so a crafted login link must not be
    // able to bounce a freshly authenticated user off-origin.
    it('rejects anything that would leave the app', () => {
      expect(getSafeReturnUrl('https://evil.com/steal')).toBeNull();
      expect(getSafeReturnUrl('//evil.com/steal')).toBeNull();
      expect(getSafeReturnUrl('/\\evil.com/steal')).toBeNull();
      expect(getSafeReturnUrl('javascript:alert(1)')).toBeNull();
      expect(getSafeReturnUrl('album/xyz')).toBeNull();
    });

    it('rejects the non-Angular hosting prefixes', () => {
      expect(getSafeReturnUrl('/web/news')).toBeNull();
      expect(getSafeReturnUrl('/__/auth/action')).toBeNull();
    });
  });
});

describe('app origin (spec 1.82: links from native builds)', () => {
  it('derives app.<apex> from either appDomain form, like the alias functions', () => {
    expect(publicAppOrigin('seeclub.org', 'scs')).toBe('https://app.seeclub.org');
    expect(publicAppOrigin('app.kring.ch', 'kring')).toBe('https://app.kring.ch');
    expect(publicAppOrigin(' https://App.P13.ch/ ', 'p13')).toBe('https://app.p13.ch');
  });
  it('falls back to the Firebase Hosting default without a domain', () => {
    expect(publicAppOrigin('', 'scs')).toBe('https://scs-app-54aef.web.app');
    expect(publicAppOrigin(undefined, 'elab')).toBe('https://elab-app-54aef.web.app');
  });
  it('treats the native Capacitor origins as not shareable', () => {
    expect(isWebOrigin('capacitor://localhost')).toBe(false);
    expect(isWebOrigin('https://localhost')).toBe(false);
    expect(isWebOrigin('')).toBe(false);
    expect(isWebOrigin(undefined)).toBe(false);
  });
  it('treats real web origins and dev serve as shareable', () => {
    expect(isWebOrigin('https://app.seeclub.org')).toBe(true);
    expect(isWebOrigin('http://localhost:4200')).toBe(true);
    expect(isWebOrigin('https://scs-app-54aef.web.app')).toBe(true);
  });
  it('resolves to the page origin on the web and to the public origin natively', () => {
    expect(resolveAppOrigin('https://app.seeclub.org', 'https://scs-app-54aef.web.app')).toBe('https://scs-app-54aef.web.app');
    expect(resolveAppOrigin('https://app.seeclub.org', 'capacitor://localhost')).toBe('https://app.seeclub.org');
    expect(resolveAppOrigin('https://app.seeclub.org', 'https://localhost')).toBe('https://app.seeclub.org');
    expect(resolveAppOrigin('https://app.seeclub.org', undefined)).toBe('https://app.seeclub.org');
  });
  it('lists the link origin first, deduplicated', () => {
    expect(appLinkOrigins('https://app.seeclub.org', 'https://app.seeclub.org')).toEqual(['https://app.seeclub.org']);
    expect(appLinkOrigins('https://app.seeclub.org', 'http://localhost:4200')).toEqual(['http://localhost:4200', 'https://app.seeclub.org']);
    expect(appLinkOrigins('https://app.seeclub.org', 'capacitor://localhost')).toEqual(['https://app.seeclub.org', 'capacitor://localhost']);
  });
});

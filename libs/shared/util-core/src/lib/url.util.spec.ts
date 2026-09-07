import { describe, expect, it } from 'vitest';
import { getDeepLinkPath, getSafeEmbedUrl } from './url.util';

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
});

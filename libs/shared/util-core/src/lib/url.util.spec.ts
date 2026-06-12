import { describe, expect, it } from 'vitest';
import { getSafeEmbedUrl } from './url.util';

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
});

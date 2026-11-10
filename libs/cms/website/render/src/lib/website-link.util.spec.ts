import { isAllowedLinkUrl } from './website-link.util';

describe('isAllowedLinkUrl', () => {
  it('accepts same-site paths, https and mailto', () => {
    for (const ok of ['/', '/termine?cat=regatta', 'https://a.ch', 'mailto:a@b.ch', ' HTTPS://a.ch ']) {
      expect(isAllowedLinkUrl(ok)).toBe(true);
    }
  });
  it('rejects protocol-relative, prefix-only and other schemes', () => {
    for (const bad of ['//evil.com', '/\\evil.com', 'https://', 'mailto:', 'http://x.ch', 'tel:+41', 'javascript:alert(1)', '', 'ftp://x']) {
      expect(isAllowedLinkUrl(bad)).toBe(false);
    }
  });
});

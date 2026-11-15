import { isAllowedLinkUrl, isExternalLinkUrl } from './website-link.util';

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

describe('isExternalLinkUrl', () => {
  const origin = 'https://www.seeclub.org';

  it('flags an https link to another host', () => {
    expect(isExternalLinkUrl('https://www.instagram.com/teamdiamondrow/', origin)).toBe(true);
    expect(isExternalLinkUrl(' https://status.kring.ch/ ', origin)).toBe(true);
  });

  it('treats the site itself, with or without www, as internal', () => {
    expect(isExternalLinkUrl('https://seeclub.org/', origin)).toBe(false);
    expect(isExternalLinkUrl('https://www.seeclub.org/news', origin)).toBe(false);
  });

  it('never flags paths, mailto or unsafe urls', () => {
    for (const url of ['/news?tag=Regatten', 'mailto:info@example.org', 'javascript:alert(1)', '//evil.com', '']) {
      expect(isExternalLinkUrl(url, origin)).toBe(false);
    }
  });

  it('flags any https link when the site has no domain yet', () => {
    expect(isExternalLinkUrl('https://www.instagram.com/x/', '')).toBe(true);
  });
});

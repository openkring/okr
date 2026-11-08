// apps/functions/src/_gateway/ssrf.spec.ts
import { describe, it, expect, vi } from 'vitest';
import { assertPublicHttpsUrl, assertPublicResolvedUrl, BlockedUrlError, guardedLookup, isPrivateAddress } from './ssrf';

describe('assertPublicHttpsUrl', () => {
  it('accepts a normal https URL', () => {
    expect(() => assertPublicHttpsUrl('https://example.com/feed.xml')).not.toThrow();
  });

  it('rejects http (non-TLS)', () => {
    expect(() => assertPublicHttpsUrl('http://example.com')).toThrow(/https/i);
  });

  it('rejects non-http schemes', () => {
    expect(() => assertPublicHttpsUrl('file:///etc/passwd')).toThrow();
    expect(() => assertPublicHttpsUrl('ftp://example.com')).toThrow();
  });

  it('rejects localhost and loopback', () => {
    expect(() => assertPublicHttpsUrl('https://localhost/x')).toThrow(/private|not allowed/i);
    expect(() => assertPublicHttpsUrl('https://127.0.0.1/x')).toThrow();
  });

  it('rejects private IPv4 ranges', () => {
    expect(() => assertPublicHttpsUrl('https://10.0.0.5/x')).toThrow();
    expect(() => assertPublicHttpsUrl('https://192.168.1.1/x')).toThrow();
    expect(() => assertPublicHttpsUrl('https://172.16.0.1/x')).toThrow();
    expect(() => assertPublicHttpsUrl('https://169.254.169.254/latest/meta-data')).toThrow();
  });

  it('rejects garbage', () => {
    expect(() => assertPublicHttpsUrl('not a url')).toThrow();
  });
});

describe('isPrivateAddress', () => {
  it.each([
    '10.1.2.3', '127.0.0.1', '169.254.169.254', '172.16.0.1', '172.31.255.255', '192.168.0.1',
    '100.64.0.1', '100.127.255.255', '0.0.0.0', '224.0.0.1', '255.255.255.255',
    '::1', '::', 'fc00::1', 'fd12:3456::1', 'fe80::1', 'febf::1', '::ffff:127.0.0.1', '::ffff:7f00:1',
    '::ffff:10.0.0.1', '64:ff9b::a00:1', 'ff02::1', 'not-an-ip',
  ])('%s is private', (ip) => {
    expect(isPrivateAddress(ip)).toBe(true);
  });

  it.each(['8.8.8.8', '172.32.0.1', '100.128.0.1', '193.5.1.1', '2a00:1450:4001:80b::200e', '::ffff:8.8.8.8'])(
    '%s is public',
    (ip) => {
      expect(isPrivateAddress(ip)).toBe(false);
    },
  );
});

describe('assertPublicResolvedUrl', () => {
  const resolvesTo = (...ips: string[]) => async () => ips;

  it('accepts a host that resolves to a public address', async () => {
    await expect(assertPublicResolvedUrl('https://feeds.example.com/rss', { lookup: resolvesTo('93.184.216.34') })).resolves.toBeUndefined();
  });

  it.each([
    '10.0.0.7', '127.0.0.1', '169.254.169.254', '172.20.1.1', '192.168.1.10', '100.100.0.1', '0.1.2.3',
    '::1', 'fc00::5', 'fe80::1', '::ffff:127.0.0.1',
  ])('rejects a host that resolves to %s', async (ip) => {
    await expect(assertPublicResolvedUrl('https://evil.example.com/', { lookup: resolvesTo(ip) })).rejects.toBeInstanceOf(BlockedUrlError);
  });

  it('rejects when any of several addresses is private', async () => {
    await expect(assertPublicResolvedUrl('https://evil.example.com/', { lookup: resolvesTo('93.184.216.34', '10.0.0.1') })).rejects.toThrow(BlockedUrlError);
  });

  it('rejects a host that resolves to nothing', async () => {
    await expect(assertPublicResolvedUrl('https://nx.example.com/', { lookup: resolvesTo() })).rejects.toThrow(BlockedUrlError);
  });

  it('rejects private IP literals without a DNS lookup', async () => {
    const lookup = vi.fn(resolvesTo('93.184.216.34'));
    for (const raw of ['https://10.0.0.1/', 'https://[::1]/', 'https://[::ffff:127.0.0.1]/', 'https://2130706433/', 'https://100.64.1.1/']) {
      await expect(assertPublicResolvedUrl(raw, { lookup })).rejects.toThrow(BlockedUrlError);
    }
    expect(lookup).not.toHaveBeenCalled();
  });

  it('rejects any explicit port other than 443', async () => {
    await expect(assertPublicResolvedUrl('https://feeds.example.com:8443/rss', { lookup: resolvesTo('93.184.216.34') })).rejects.toThrow(/port/i);
    await expect(assertPublicResolvedUrl('https://feeds.example.com:443/rss', { lookup: resolvesTo('93.184.216.34') })).resolves.toBeUndefined();
  });

  it('rejects http by default, localhost, credentials and other schemes', async () => {
    const lookup = resolvesTo('93.184.216.34');
    await expect(assertPublicResolvedUrl('http://feeds.example.com/rss', { lookup })).rejects.toThrow(/https/i);
    await expect(assertPublicResolvedUrl('https://localhost/', { lookup })).rejects.toThrow(BlockedUrlError);
    await expect(assertPublicResolvedUrl('https://user:pw@feeds.example.com/', { lookup })).rejects.toThrow(BlockedUrlError);
    await expect(assertPublicResolvedUrl('file:///etc/passwd', { lookup })).rejects.toThrow(BlockedUrlError);
    await expect(assertPublicResolvedUrl('not a url', { lookup })).rejects.toThrow(BlockedUrlError);
  });

  it('allows http and any port only when asked to (newsImage)', async () => {
    const lookup = resolvesTo('93.184.216.34');
    await expect(assertPublicResolvedUrl('http://cam.example.com:8080/snap.jpeg', { allowHttp: true, allowAnyPort: true, lookup })).resolves.toBeUndefined();
    await expect(assertPublicResolvedUrl('http://cam.example.com:8080/snap.jpeg', { allowHttp: true, lookup })).rejects.toThrow(/port/i);
    await expect(assertPublicResolvedUrl('http://cam.example.com/snap.jpeg', { allowHttp: true, lookup })).resolves.toBeUndefined();
    await expect(assertPublicResolvedUrl('http://cam.example.com:8080/x', { allowHttp: true, allowAnyPort: true, lookup: resolvesTo('192.168.1.5') })).rejects.toThrow(BlockedUrlError);
  });

  it('never puts the full URL into the error message', async () => {
    await expect(assertPublicResolvedUrl('https://evil.example.com/secret-path?token=abc', { lookup: resolvesTo('10.0.0.1') })).rejects.toSatisfy(
      (e: Error) => !e.message.includes('secret-path') && !e.message.includes('token'),
    );
  });
});

describe('guardedLookup', () => {
  it('passes a public address through in the dns.lookup callback shape', async () => {
    const lookup = guardedLookup(async () => ['93.184.216.34']);
    const res = await new Promise<unknown[]>((resolve) => lookup('feeds.example.com', {}, (...args: unknown[]) => resolve(args)));
    expect(res).toEqual([null, '93.184.216.34', 4]);
  });

  it('fails the connection when the host resolves to a private address (DNS rebinding)', async () => {
    const lookup = guardedLookup(async () => ['10.0.0.1']);
    const [err] = await new Promise<unknown[]>((resolve) => lookup('feeds.example.com', {}, (...args: unknown[]) => resolve(args)));
    expect(err).toBeInstanceOf(BlockedUrlError);
  });

  it('honours opt.all', async () => {
    const lookup = guardedLookup(async () => ['93.184.216.34', '2a00:1450:4001:80b::200e']);
    const res = await new Promise<unknown[]>((resolve) => lookup('feeds.example.com', { all: true }, (...args: unknown[]) => resolve(args)));
    expect(res).toEqual([null, [{ address: '93.184.216.34', family: 4 }, { address: '2a00:1450:4001:80b::200e', family: 6 }]]);
  });
});

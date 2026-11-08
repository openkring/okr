// apps/functions/src/_gateway/ssrf.ts
//
// SSRF hardening for adapters that take a USER-SUPPLIED URL (§4 of the spec).
// https-only, block private / loopback / link-local ranges. DNS-rebinding is not
// fully solved here (a hostname can resolve to a private IP after this check) —
// the gateway also caps redirects, response size and timeout in http.ts. Revisit
// with resolve-then-pin if a webcam/feed adapter needs it.
//
// The NewsCenter relay needs it: see assertPublicResolvedUrl / guardedLookup below.

import { promises as dns } from 'dns';
import { isIP } from 'net';

const PRIVATE_V4 = [
  /^10\./,
  /^127\./,
  /^169\.254\./,          // link-local (incl. cloud metadata 169.254.169.254)
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\./,
];

export function assertPublicHttpsUrl(raw: string): void {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`Invalid URL: ${raw}`);
  }
  if (url.protocol !== 'https:') {
    throw new Error(`Only https URLs are allowed, got ${url.protocol}`);
  }
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host === '::1' || host === '[::1]') {
    throw new Error(`Host ${host} is not allowed (private/loopback)`);
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) && PRIVATE_V4.some((re) => re.test(host))) {
    throw new Error(`Host ${host} is not allowed (private range)`);
  }
}

// ---------------------------------------------------------------------------------------------
// Resolved-address guard (NewsCenter relay, design 2026-11-08 §7 / §7.1).
//
// assertPublicHttpsUrl above only looks at the URL text. A relay that fetches admin-configured
// feed URLs must also refuse a public-looking hostname that RESOLVES to an internal address, so
// `assertPublicResolvedUrl` checks every address DNS returns. Because a hostname can resolve
// differently a moment later (DNS rebinding) and redirects lead to new hosts, the fetch itself
// passes `guardedLookup` as the socket's `lookup`: every connection — first hop and every
// redirect — re-checks the addresses it is about to connect to. IP literals never reach a
// lookup, so `assertPublicUrlShape` (run up front and in `beforeRedirect`) covers them.
//
// Error messages name the host at most, never the full URL (paths may carry tokens).
// ---------------------------------------------------------------------------------------------


/** A URL or address the relay refuses to fetch. */
export class BlockedUrlError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'BlockedUrlError';
  }
}

/** True when `err` is, or wraps (axios → follow-redirects → …), a BlockedUrlError. */
export function isBlockedUrlError(err: unknown): boolean {
  let cur: unknown = err;
  for (let i = 0; i < 6 && cur; i++) {
    if (cur instanceof BlockedUrlError) return true;
    cur = (cur as { cause?: unknown }).cause;
  }
  return false;
}

export interface PublicUrlOptions {
  /** Also accept `http:` (newsImage only). Default: https only. */
  allowHttp?: boolean;
  /** Accept any explicit port (newsImage only). Default: the scheme's default port only. */
  allowAnyPort?: boolean;
  /** DNS seam for tests: host → all its addresses. Default: `dns.promises.lookup(host, { all: true })`. */
  lookup?: (host: string) => Promise<string[]>;
}

/** [first address, prefix length] — IPv4 ranges that are not the public internet. */
const BLOCKED_V4: [string, number][] = [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8],
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8],
  ['169.254.0.0', 16], // link-local, incl. cloud metadata 169.254.169.254
  ['172.16.0.0', 12],
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // TEST-NET-1
  ['192.168.0.0', 16],
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // TEST-NET-2
  ['203.0.113.0', 24], // TEST-NET-3
  ['224.0.0.0', 3], // multicast, reserved, broadcast (224.0.0.0 – 255.255.255.255)
];

function v4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, part) => acc * 256 + Number(part), 0);
}

function isBlockedV4(ip: string): boolean {
  const n = v4ToInt(ip);
  return BLOCKED_V4.some(([base, bits]) => {
    const size = 2 ** (32 - bits);
    const start = v4ToInt(base);
    return n >= start && n < start + size;
  });
}

/** The eight 16-bit groups of an IPv6 address (handles `::` and a trailing dotted IPv4). */
function v6Groups(ip: string): number[] | undefined {
  let s = ip.toLowerCase();
  const zone = s.indexOf('%');
  if (zone >= 0) s = s.slice(0, zone);
  const tail: number[] = [];
  const dotted = s.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    if (isIP(dotted[1]) !== 4) return undefined;
    const n = v4ToInt(dotted[1]);
    tail.push(Math.floor(n / 65536), n % 65536);
    s = s.slice(0, -dotted[1].length);
    if (s.endsWith(':') && !s.endsWith('::')) s = s.slice(0, -1);
  }
  const halves = s.split('::');
  if (halves.length > 2) return undefined;
  const parse = (part: string) => (part === '' ? [] : part.split(':').map((h) => parseInt(h, 16)));
  const head = parse(halves[0]);
  const rest = halves.length === 2 ? parse(halves[1]) : [];
  const fill = 8 - head.length - rest.length - tail.length;
  if (halves.length === 1 && fill !== 0) return undefined;
  if (fill < 0) return undefined;
  const groups = [...head, ...Array(halves.length === 2 ? fill : 0).fill(0), ...rest, ...tail];
  return groups.length === 8 && groups.every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff) ? groups : undefined;
}

function embeddedV4(g: number[]): string {
  return [g[6] >> 8, g[6] & 0xff, g[7] >> 8, g[7] & 0xff].join('.');
}

function isBlockedV6(ip: string): boolean {
  const g = v6Groups(ip);
  if (!g) return true;
  const zeroUpTo = (n: number) => g.slice(0, n).every((x) => x === 0);
  if (zeroUpTo(8)) return true; // ::
  if (zeroUpTo(7) && g[7] === 1) return true; // ::1
  if (zeroUpTo(5) && g[5] === 0xffff) return isBlockedV4(embeddedV4(g)); // ::ffff:a.b.c.d (IPv4-mapped)
  if (zeroUpTo(6)) return true; // ::a.b.c.d (deprecated IPv4-compatible) — never a real destination
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return isBlockedV4(embeddedV4(g)); // NAT64
  if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((g[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((g[0] & 0xffc0) === 0xfec0) return true; // fec0::/10 site-local (deprecated)
  if ((g[0] & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true; // documentation
  return false;
}

/** True for anything that is not a public unicast address — including input that is not an IP at all. */
export function isPrivateAddress(ip: string): boolean {
  const bare = ip.replace(/^\[|\]$/g, '');
  const family = isIP(bare);
  if (family === 4) return isBlockedV4(bare);
  if (family === 6) return isBlockedV6(bare);
  return true;
}

/**
 * The checks that need no DNS: scheme, port, credentials, `localhost`, IP literals. Returns the
 * parsed URL. Synchronous, so it can run inside axios' `beforeRedirect` for every hop.
 */
export function assertPublicUrlShape(raw: string, opts: PublicUrlOptions = {}): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BlockedUrlError('Invalid URL');
  }
  const schemes = opts.allowHttp ? ['https:', 'http:'] : ['https:'];
  if (!schemes.includes(url.protocol)) {
    throw new BlockedUrlError(opts.allowHttp ? `Only http(s) URLs are allowed, got ${url.protocol}` : `Only https URLs are allowed, got ${url.protocol}`);
  }
  // WHATWG URL drops the scheme's default port, so any non-empty port is an explicit, non-default one.
  if (url.port !== '' && !opts.allowAnyPort) {
    throw new BlockedUrlError(`Port ${url.port} is not allowed on ${url.hostname}`);
  }
  if (url.username !== '' || url.password !== '') {
    throw new BlockedUrlError(`Credentials in the URL are not allowed (${url.hostname})`);
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (host === '' || host === 'localhost' || host.endsWith('.localhost')) {
    throw new BlockedUrlError(`Host ${host} is not allowed (loopback)`);
  }
  if (isIP(host) !== 0 && isPrivateAddress(host)) {
    throw new BlockedUrlError(`Host ${host} is not allowed (private range)`);
  }
  return url;
}

async function dnsLookupAll(host: string): Promise<string[]> {
  const res = await dns.lookup(host, { all: true, verbatim: true });
  return res.map((r) => r.address);
}

/** All addresses of `host`, or a BlockedUrlError when there are none or any of them is internal. */
async function resolvePublicAddresses(host: string, lookup: (host: string) => Promise<string[]>): Promise<string[]> {
  let addresses: string[];
  try {
    addresses = await lookup(host);
  } catch {
    throw new BlockedUrlError(`Host ${host} does not resolve`);
  }
  if (addresses.length === 0) throw new BlockedUrlError(`Host ${host} does not resolve`);
  const internal = addresses.find((a) => isPrivateAddress(a));
  if (internal !== undefined) throw new BlockedUrlError(`Host ${host} resolves to a private address`);
  return addresses;
}

/**
 * Refuse a URL whose scheme/port/host is not allowed or whose hostname resolves to any private,
 * loopback, link-local, CGNAT or metadata address (IPv4 and IPv6). Defaults: https, port 443.
 */
export async function assertPublicResolvedUrl(raw: string, opts: PublicUrlOptions = {}): Promise<void> {
  const url = assertPublicUrlShape(raw, opts);
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host) !== 0) return; // literal already checked by the shape guard
  await resolvePublicAddresses(host, opts.lookup ?? dnsLookupAll);
}

type LookupCallback = (err: Error | null, address?: string | { address: string; family: number }[], family?: number) => void;

/**
 * A `dns.lookup`-compatible function for axios' `lookup` option: resolves the host and fails the
 * connection when any address is internal. Plain callback style (not `async`) so axios hands it to
 * Node unchanged; follow-redirects keeps it for every redirect hop.
 */
export function guardedLookup(lookup: (host: string) => Promise<string[]> = dnsLookupAll) {
  return (hostname: string, options: { all?: boolean } | number | undefined, cb: LookupCallback): void => {
    resolvePublicAddresses(hostname, lookup).then(
      (addresses) => {
        const entries = addresses.map((address) => ({ address, family: isIP(address) }));
        if (typeof options === 'object' && options?.all) cb(null, entries);
        else cb(null, entries[0].address, entries[0].family);
      },
      (err: Error) => cb(err),
    );
  };
}

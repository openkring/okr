import { isIP } from 'node:net';

/**
 * The client IP for the form rate limit (§10.4), from `X-Forwarded-For`.
 *
 * The caller can send that header itself; Google's front end then APPENDS the address it saw, and
 * a load balancer may append its own after it. So the leftmost entry is the caller's choice (a bot
 * rotates it to dodge the limit), and the plain rightmost one may be Google's proxy (every user
 * would share one bucket). The answer is the rightmost entry that is a public address: nothing the
 * caller writes can come after the front end's own entry, and proxy hops are skipped.
 */

/** IPv4 ranges that are never a caller: private, loopback, link-local, CGNAT, and Google's front-end proxies. */
const NON_CLIENT_V4: ReadonlyArray<[number, number]> = [
  [0x0a000000, 8], // 10.0.0.0/8
  [0x7f000000, 8], // 127.0.0.0/8
  [0xa9fe0000, 16], // 169.254.0.0/16
  [0xac100000, 12], // 172.16.0.0/12
  [0xc0a80000, 16], // 192.168.0.0/16
  [0x64400000, 10], // 100.64.0.0/10
  [0x23bf0000, 16], // 35.191.0.0/16 — Google front end / health checks
  [0x82d30000, 22], // 130.211.0.0/22 — Google front end / health checks
];

function v4ToInt(ip: string): number {
  return ip.split('.').reduce((n, part) => (n << 8) + Number(part), 0) >>> 0;
}

function isPublicV4(ip: string): boolean {
  const n = v4ToInt(ip);
  return !NON_CLIENT_V4.some(([base, bits]) => (n >>> (32 - bits)) === (base >>> (32 - bits)));
}

function isPublicV6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return false;
  // fc00::/7 unique-local, fe80::/10 link-local
  return !/^f[cd]/.test(lower) && !/^fe[89ab]/.test(lower);
}

/** True for a well-formed public address (v4 or v6); garbage and proxy/private hops are false. */
export function isPublicIp(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return isPublicV4(ip);
  if (kind === 6) {
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
    return mapped !== null ? isPublicV4(mapped[1]) : isPublicV6(ip);
  }
  return false;
}

/**
 * The rightmost public entry of `X-Forwarded-For` (a repeated header counts in order), else
 * `fallback` (the socket address), else 'unknown'.
 */
export function trustedClientIp(forwardedFor: string | string[] | undefined, fallback?: string): string {
  const header = Array.isArray(forwardedFor) ? forwardedFor.join(',') : (forwardedFor ?? '');
  const hops = header.split(',').map((h) => h.trim()).filter((h) => h !== '');
  for (let i = hops.length - 1; i >= 0; i--) {
    if (isPublicIp(hops[i])) return hops[i];
  }
  return fallback !== undefined && fallback !== '' ? fallback : 'unknown';
}

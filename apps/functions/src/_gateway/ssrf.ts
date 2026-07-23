// apps/functions/src/_gateway/ssrf.ts
//
// SSRF hardening for adapters that take a USER-SUPPLIED URL (§4 of the spec).
// https-only, block private / loopback / link-local ranges. DNS-rebinding is not
// fully solved here (a hostname can resolve to a private IP after this check) —
// the gateway also caps redirects, response size and timeout in http.ts. Revisit
// with resolve-then-pin if a webcam/feed adapter needs it.

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

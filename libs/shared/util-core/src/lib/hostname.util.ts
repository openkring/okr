const HOSTNAME = /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/;

/**
 * A plain host name (`app.kring.ch`), trimmed and lower-cased, or undefined.
 *
 * A value used both as `https://<value>` and as `url.host = <value>` is read differently by the two
 * (port, user info, path), so anything but letters, digits, hyphens and dots between at least two labels is refused.
 */
export function bareHostname(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const host = value.trim().toLowerCase();
  return host.length <= 253 && HOSTNAME.test(host) ? host : undefined;
}

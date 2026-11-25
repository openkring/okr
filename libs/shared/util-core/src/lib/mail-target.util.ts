/**
 * The target of a button or a picture of a Versand mail (spec 1.176), as a mail client can open it: https, mailto, tel, and a
 * path of the tenant's app («/club»), made absolute with `appOrigin`. `''` for everything else: a website page («club.html»)
 * or an anchor means nothing in a mail; `//host`, http, other schemes, control characters and backslashes are not safe.
 * One rule for the app's validation and the server's renderer.
 */
export function mailTargetUrl(raw: unknown, appOrigin: string): string {
  const url = typeof raw === 'string' ? raw.trim() : '';
  // mail clients and browsers drop a tab or line break inside a scheme and read a backslash as a slash
  // eslint-disable-next-line no-control-regex -- rejecting control characters is the point
  if (/[\\\u0000-\u001f\u007f]/.test(url)) return '';
  if (/^\/(?!\/)/.test(url)) return `${appOrigin.replace(/\/+$/, '')}${url}`;
  return /^(https:\/\/|mailto:|tel:)/.test(url) ? url : '';
}

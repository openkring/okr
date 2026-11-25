/**
 * The target of a button or a picture of a Versand mail (spec 1.176), as a mail client can open it: https, mailto, tel, and a
 * path of the tenant's app («/club»), made absolute with `appOrigin`. `''` for everything else: a website page («club.html»)
 * or an anchor means nothing in a mail; `//host`, http, other schemes, control characters and backslashes are not safe, and
 * a scheme without a target («mailto:») opens nothing. A scheme typed in capitals comes back in small letters.
 * One rule for the app's validation and the server's renderer.
 */
export function mailTargetUrl(raw: unknown, appOrigin: string): string {
  const url = typeof raw === 'string' ? raw.trim() : '';
  // mail clients and browsers drop a tab or line break inside a scheme and read a backslash as a slash
  // eslint-disable-next-line no-control-regex -- rejecting control characters is the point
  if (/[\\\u0000-\u001f\u007f]/.test(url)) return '';
  if (/^\/(?!\/)/.test(url)) return `${appOrigin.replace(/\/+$/, '')}${url}`;
  if (!/^(https:\/\/[^\s/?#]|mailto:[^\s?]|tel:[^?]*\d)/i.test(url)) return '';
  return url.replace(/^[a-z]+/i, (scheme) => scheme.toLowerCase());
}

/**
 * Whether a stored picture address can be shown in a Versand mail (spec 1.176): a storage path, or an https address. Not: no path, a
 * path from the root, http, `data:` and other schemes, control characters, backslashes, text that is no valid unicode.
 * One rule for the app's validation and the server's renderer.
 */
export function isMailPictureSource(raw: unknown): boolean {
  const url = typeof raw === 'string' ? raw.trim() : '';
  // eslint-disable-next-line no-control-regex -- rejecting control characters is the point
  if (url === '' || url.startsWith('/') || /[\\\u0000-\u001f\u007f]/.test(url)) return false;
  try {
    encodeURIComponent(url);
  } catch {
    return false; // no valid unicode
  }
  return !/^[a-z][a-z\d+.-]*:/i.test(url) || /^https:\/\/[^\s/?#]/i.test(url);
}

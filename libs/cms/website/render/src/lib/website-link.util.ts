export const LINK_PREFIXES = ['/', 'https://', 'mailto:'];

/** Only same-site paths, https and mailto links may enter the published navigation. */
export function isAllowedLinkUrl(url: string): boolean {
  const u = (url ?? '').trim();
  if (/^\/[/\\]/.test(u)) return false; // protocol-relative (`//host`, `/\host`)
  return LINK_PREFIXES.some((p) => u.toLowerCase().startsWith(p) && (p === '/' || u.length > p.length));
}

function bareHost(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * An https link to another site: the published nav opens it in a new tab. A host that differs
 * from the site's own only by a leading 'www.' counts as the same site; paths and mailto never
 * leave it.
 */
export function isExternalLinkUrl(url: string, siteOrigin: string): boolean {
  const u = (url ?? '').trim();
  if (!isAllowedLinkUrl(u) || !u.toLowerCase().startsWith('https://')) return false;
  const host = bareHost(u);
  return !!host && host !== bareHost(siteOrigin);
}

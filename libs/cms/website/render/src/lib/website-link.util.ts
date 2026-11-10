export const LINK_PREFIXES = ['/', 'https://', 'mailto:'];

/** Only same-site paths, https and mailto links may enter the published navigation. */
export function isAllowedLinkUrl(url: string): boolean {
  const u = (url ?? '').trim();
  if (/^\/[/\\]/.test(u)) return false; // protocol-relative (`//host`, `/\host`)
  return LINK_PREFIXES.some((p) => u.toLowerCase().startsWith(p) && (p === '/' || u.length > p.length));
}

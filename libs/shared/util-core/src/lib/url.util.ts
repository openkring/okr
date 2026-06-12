/**
 * Hosts that may be embedded in an <iframe> — kept in sync with the CSP
 * `frame-src` in firebase.json. Editor-supplied iframe/video URLs are validated
 * against this allowlist before being trusted, to prevent stored XSS via a
 * `javascript:`/`data:` URL or an attacker-controlled host (security report H-3).
 */
export const ALLOWED_EMBED_HOSTS: readonly string[] = [
  'www.youtube.com', 'youtube.com',
  'www.youtube-nocookie.com', 'youtube-nocookie.com',
  'player.vimeo.com', 'vimeo.com',
  'www.openstreetmap.org', 'openstreetmap.org',
];

/**
 * Validate an editor-supplied embed URL.
 * @param url absolute URL to validate (e.g. a YouTube/Vimeo/OpenStreetMap embed)
 * @param allowedHosts host allowlist (defaults to {@link ALLOWED_EMBED_HOSTS})
 * @returns the normalized URL when it is an `https:` URL on an allowlisted host,
 *          otherwise `null`. Blocks `javascript:`, `data:`, `http:` and any host
 *          not on the allowlist.
 */
export function getSafeEmbedUrl(
  url: string | undefined | null,
  allowedHosts: readonly string[] = ALLOWED_EMBED_HOSTS,
): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  if (!allowedHosts.includes(parsed.hostname.toLowerCase())) return null;
  return parsed.toString();
}

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

/**
 * Path prefixes that must never be turned into an in-app route by a deep link.
 * `/web/*` is the embedded static marketing site and `/__/*` are the Firebase
 * Auth action handlers (password reset, email verification) — both are plain
 * documents served by Hosting, not Angular routes. They are also excluded in
 * each app's `apple-app-site-association`, so iOS should not hand them over in
 * the first place; this is the second line of defence.
 */
export const DEEP_LINK_EXCLUDED_PREFIXES: readonly string[] = ['/web/', '/__/', '/.well-known/'];

/**
 * Translate the URL delivered by a Universal Link / App Link (Capacitor's
 * `appUrlOpen`, or `App.getLaunchUrl()` on a cold start) into the in-app route
 * to navigate to.
 *
 * Only ever returns a **relative** path, so the result can never be used to
 * navigate the app to a foreign origin: an attacker-supplied absolute URL is
 * reduced to its path or rejected outright.
 *
 * @param rawUrl the URL as handed over by the OS, e.g.
 *        `https://seeclub.org/album/xyz?p=2` or the custom scheme
 *        `org.bkaiser.scs://album/xyz`
 * @returns `pathname + search + hash` (always starting with `/`), or `null`
 *          when the URL is unusable, empty, or points at an excluded prefix.
 */
export function getDeepLinkPath(rawUrl: string | undefined | null): string | null {
  if (!rawUrl) return null;

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }

  let path: string;
  if (parsed.protocol === 'https:') {
    path = `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } else if (parsed.protocol === 'http:') {
    // never follow an unencrypted link into the app
    return null;
  } else {
    // custom scheme: `org.bkaiser.scs://album/xyz` parses with host `album`,
    // so reassemble the path from host + pathname instead of trusting pathname.
    const rest = rawUrl.slice(rawUrl.indexOf(':') + 1).replace(/^\/+/, '');
    path = rest ? `/${rest}` : '/';
  }

  return isNavigableInternalPath(path) ? path : null;
}

/**
 * Whether `path` is a relative route this app may navigate to.
 *
 * Rejects anything that could leave the app: a path not rooted at `/`, a
 * protocol-relative `//host` (which browsers resolve to a foreign origin), a
 * backslash variant of the same trick (`/\\host` — browsers normalise `\\` to `/`),
 * the bare root (no destination), and the non-Angular Hosting prefixes.
 */
function isNavigableInternalPath(path: string): boolean {
  if (!path.startsWith('/')) return false;
  if (path === '/') return false;
  if (path.startsWith('//') || path.startsWith('/\\')) return false;
  return !DEEP_LINK_EXCLUDED_PREFIXES.some((prefix) => path.startsWith(prefix));
}

/**
 * Validate a `returnUrl` carried through the login round-trip.
 *
 * `isAuthenticatedGuard` puts the route the user actually asked for into the
 * login URL so that signing in resumes there instead of dumping them on the
 * dashboard. That value comes back through the address bar, so it is
 * attacker-controllable: an open `returnUrl` would let a crafted login link
 * bounce a freshly authenticated user to a foreign origin. Only a relative
 * in-app route survives.
 *
 * @param returnUrl the raw query-parameter value (already URL-decoded by Angular)
 * @returns the path to resume at, or `null` when the caller should fall back to
 *          the configured `rootUrl`
 */
export function getSafeReturnUrl(returnUrl: string | undefined | null): string | null {
  if (!returnUrl) return null;
  return isNavigableInternalPath(returnUrl) ? returnUrl : null;
}

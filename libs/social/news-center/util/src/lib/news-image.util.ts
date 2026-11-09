/**
 * Lets an external feed image (thumbnail, channel avatar) reach the browser without passing through
 * the Angular service worker.
 *
 * ngsw answers every same-scope request — cross-origin `<img>` loads included — by re-fetching it
 * with `fetch()`. That fetch is governed by the worker's `connect-src`, not the page's `img-src`.
 * Feed artwork lives on arbitrary hosts (download-media.srf.ch, i.ytimg.com, acast, …) that no
 * `connect-src` list can enumerate, so the worker's fetch is refused and ngsw synthesises a
 * 504 Gateway Timeout: the thumbnail shows «Bild nicht verfügbar», the avatar the generic icon.
 *
 * The `ngsw-bypass` query parameter makes ngsw skip `respondWith`, so the browser loads the image
 * itself under the page's `img-src 'self' data: https: blob:`.
 *
 * Only absolute http(s) URLs are rewritten; `data:` / `blob:` / relative URLs, empty strings and
 * unparsable input are returned unchanged, as is a URL that already carries the parameter.
 */
export function bypassServiceWorker(url: string | null | undefined): string {
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) return url;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  if (parsed.searchParams.has('ngsw-bypass')) return url;
  parsed.searchParams.set('ngsw-bypass', 'true');
  return parsed.toString();
}

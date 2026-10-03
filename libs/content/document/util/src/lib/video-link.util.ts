/** Custom Matrix message field carrying the album video a chat message points at (spec 1.82 §8). */
export const OKR_VIDEO_FIELD = 'org.okr.video';

// A Firestore id this app writes: no reserved `__…__` id (signVideoUrls refuses those too).
const KEY_RE = /^(?!__.*__$)[A-Za-z0-9_-]{1,64}$/;

/** Whether `key` is an album video document key a link or message may carry. */
export function isVideoDocKey(key: unknown): key is string {
  return typeof key === 'string' && KEY_RE.test(key);
}

/**
 * Canonical video link: `<origin>/video/<docKey>`. Pass `AppStore.appOrigin()` — never a raw
 * `location.origin`, which is `capacitor://localhost` in the native builds.
 */
export function videoLink(origin: string, docKey: string): string {
  return `${origin}/video/${encodeURIComponent(docKey)}`;
}

/**
 * The docKey when the trimmed text is exactly a video link on one of `origins` (scheme + host +
 * port — pass `AppStore.appLinkOrigins()`: the public app origin and the page's own), with no
 * query and no hash; else undefined.
 */
export function parseVideoLink(text: string, origins: string | readonly string[]): string | undefined {
  try {
    const trimmed = text.trim();
    const url = new URL(trimmed);
    const allowed = (typeof origins === 'string' ? [origins] : origins).map(o => {
      try { return new URL(o).origin; } catch { return undefined; }
    });
    if (url.origin === 'null' || !allowed.includes(url.origin)) return undefined;
    if (url.search !== '' || url.hash !== '' || trimmed.includes('?') || trimmed.includes('#')) return undefined;
    const m = /^\/video\/([^/]+)\/?$/.exec(url.pathname);
    if (!m) return undefined;
    const key = decodeURIComponent(m[1]);
    return KEY_RE.test(key) ? key : undefined;
  } catch {
    return undefined;
  }
}

/** Validated read of `content['org.okr.video']`. */
export function readOkrVideo(content: unknown): { docKey: string; tenantId: string } | undefined {
  if (typeof content !== 'object' || content === null) return undefined;
  const v = (content as Record<string, unknown>)[OKR_VIDEO_FIELD];
  if (typeof v !== 'object' || v === null) return undefined;
  const { docKey, tenantId } = v as Record<string, unknown>;
  if (typeof docKey !== 'string' || !KEY_RE.test(docKey) || typeof tenantId !== 'string') return undefined;
  return { docKey, tenantId };
}

/** The custom field wins; the body link is the fallback for clients that only send text. */
export function videoDocKeyOf(content: unknown, body: string, origins: string | readonly string[]): string | undefined {
  return readOkrVideo(content)?.docKey ?? parseVideoLink(body, origins);
}

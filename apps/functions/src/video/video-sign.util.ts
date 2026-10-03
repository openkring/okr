/** Signed-URL window (spec 1.74 D6): URLs stay identical — and cacheable — within it. */
export const WINDOW_MS = 6 * 3600 * 1000;
const MIN_VALIDITY_MS = 3600 * 1000;
/** An album page signs its visible videos in one call; more than this is not a page. */
export const MAX_VIDEO_KEYS = 100;

/** imgix video params — values confirmed by the spike (spec 1.82 §9). */
export const POSTER_PARAMS = { 'video-thumbnail-time': 2, fm: 'jpg', w: 600 } as const;
// `fit: 'max'` caps at 720 lines but never scales up — without it imgix enlarged a 320×240
// camera AVI to 960×720 and a 640×360 clip to 1280×720 at twice the bytes (2026-10-03).
export const MP4_PARAMS = { fm: 'mp4', h: 720, fit: 'max' } as const;

/** End of the window that leaves at least one hour of validity, on a WINDOW_MS boundary. */
export function windowExpiry(nowMs: number): number {
  return Math.ceil((nowMs + MIN_VALIDITY_MS) / WINDOW_MS) * WINDOW_MS;
}

export function validVideoKeys(keys: unknown): string[] {
  if (!Array.isArray(keys)) return [];
  const ok = (k: unknown): k is string => typeof k === 'string' && k.length > 0 && !k.includes('/') && k !== '.' && k !== '..';
  return [...new Set(keys.filter(ok))].slice(0, MAX_VIDEO_KEYS);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Whether `path` has exactly the album-video layout the private-bucket Storage rule admits:
 * `tenant/<tid>/(section|folder)/<key>/album/<sub>/<rest…>.(mp4|mov)`, `<sub>` not `renderings`,
 * no empty, `.` or `..` segment. `fullPath` is author-editable document data, so anything looser
 * would let a doc author have `signVideoUrls` sign arbitrary private objects (exports, invoices).
 */
export function isAlbumVideoObjectPath(path: string, tenantId: string): boolean {
  if (!tenantId || typeof path !== 'string') return false;
  if (path.split('/').some(seg => seg === '' || seg === '.' || seg === '..')) return false;
  const re = new RegExp(`^tenant/${escapeRegExp(tenantId)}/(section|folder)/[^/]+/album/([^/]+)/.+\\.(mp4|mov)$`, 'i');
  const m = re.exec(path);
  return !!m && m[2].toLowerCase() !== 'renderings';
}

/**
 * `Content-Disposition` for the download of an original: an ASCII `filename` fallback (non-ASCII,
 * `"` and `\` replaced by `_`) plus the RFC 5987 `filename*` with the UTF-8 original. The name
 * keeps the extension of `path` when the title has none.
 */
export function contentDisposition(title: string, path: string): string {
  const base = path.split('/').pop() ?? '';
  const pathExt = /\.[^./]+$/.exec(base)?.[0] ?? '';
  let name = (title ?? '').trim() || base || 'video';
  if (pathExt && !/\.[^./\s]+$/.test(name)) name += pathExt;
  const ascii = name.replace(/[^\x20-\x7e]|["\\]/g, '_');
  const encoded = encodeURIComponent(name).replace(/['()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

type Data = Record<string, unknown> | undefined;

/**
 * The private-bucket path of a document the caller may play, or null. Folders are the album
 * folders named in `folderKeys`; a document in folders must sit in at least one live one.
 * Spec 1.82 §5 step 3 (room audience) is added by Plan B.
 */
export function videoAccessPath(doc: Data, folders: Record<string, Data>, tenantId: string): string | null {
  if (!doc) return null;
  const tenants = (doc['tenants'] as string[] | undefined) ?? [];
  const path = String(doc['fullPath'] ?? '');
  const mime = String(doc['mimeType'] ?? '').toLowerCase();
  if (!tenants.includes(tenantId) || doc['isArchived'] === true || !mime.startsWith('video/')) return null;
  if (!isAlbumVideoObjectPath(path, tenantId)) return null;
  const folderKeys = (doc['folderKeys'] as string[] | undefined) ?? [];
  if (folderKeys.length === 0) return path;
  const live = folderKeys.some(k => {
    const f = folders[k];
    return !!f && f['isArchived'] !== true && ((f['tenants'] as string[] | undefined) ?? []).includes(tenantId);
  });
  return live ? path : null;
}

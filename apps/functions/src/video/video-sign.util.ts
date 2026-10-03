/** Signed-URL window (spec 1.74 D6): URLs stay identical — and cacheable — within it. */
export const WINDOW_MS = 6 * 3600 * 1000;
const MIN_VALIDITY_MS = 3600 * 1000;
/** An album page signs its visible videos in one call; more than this is not a page. */
export const MAX_VIDEO_KEYS = 100;

/** imgix video params — values confirmed by the spike (spec 1.82 §9). */
export const POSTER_PARAMS = { 'video-thumbnail-time': 2, fm: 'jpg', w: 600 } as const;
export const MP4_PARAMS = { fm: 'mp4', h: 720 } as const;

/** End of the window that leaves at least one hour of validity, on a WINDOW_MS boundary. */
export function windowExpiry(nowMs: number): number {
  return Math.ceil((nowMs + MIN_VALIDITY_MS) / WINDOW_MS) * WINDOW_MS;
}

export function validVideoKeys(keys: unknown): string[] {
  if (!Array.isArray(keys)) return [];
  return [...new Set(keys.filter((k): k is string => typeof k === 'string' && k.length > 0))].slice(0, MAX_VIDEO_KEYS);
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
  if (!path.startsWith(`tenant/${tenantId}/`)) return null;
  const folderKeys = (doc['folderKeys'] as string[] | undefined) ?? [];
  if (folderKeys.length === 0) return path;
  const live = folderKeys.some(k => {
    const f = folders[k];
    return !!f && f['isArchived'] !== true && ((f['tenants'] as string[] | undefined) ?? []).includes(tenantId);
  });
  return live ? path : null;
}

/** Spec 1.82 §8: a chat room album's root folder names its room; descendants inherit it. */
export const MAX_FOLDER_DEPTH = 8;

type Folder = Record<string, unknown> | undefined;

/**
 * The room audience of a document. `rooms`: every distinct room found, one per start chain at
 * most (each chain stops at its nearest `matrixRoomId`); the caller must be joined in ALL of them.
 * `unresolved`: some chain could not be walked to a room or a root — a folder is missing (not
 * loaded or not existing), a cycle, or the depth cap was hit. Unresolved must be denied.
 */
export interface Audience {
  rooms: string[];
  unresolved: boolean;
}

function roomOf(folder: Folder): string {
  // Legacy folder docs lack the field — coalesce, never trust the type.
  return String(folder?.['matrixRoomId'] ?? '');
}

/** The only parent the walk follows. */
function firstParentOf(folder: Folder): string | undefined {
  const p = folder?.['parents'];
  if (!Array.isArray(p)) return undefined;
  const first: unknown = p[0];
  return typeof first === 'string' && first.length > 0 ? first : undefined;
}

/** Walk one chain from `start` up the first-parent links. */
function walk(start: string, folders: Record<string, Folder>): { room: string } | 'unresolved' {
  const seen = new Set<string>();
  let key = start;
  for (let depth = 0; depth <= MAX_FOLDER_DEPTH; depth++) {
    if (seen.has(key)) return 'unresolved';               // cycle
    seen.add(key);
    const folder = folders[key];
    if (!folder) return 'unresolved';                     // not loaded or does not exist
    const room = roomOf(folder);
    if (room) return { room };
    const parent = firstParentOf(folder);
    if (!parent) return { room: '' };                     // reached a root without a room
    key = parent;
  }
  return 'unresolved';                                    // depth cap hit before a root
}

export function audienceOf(startKeys: string[], folders: Record<string, Folder>): Audience {
  const rooms = new Set<string>();
  for (const start of new Set(startKeys.filter(k => typeof k === 'string' && k.length > 0))) {
    const r = walk(start, folders);
    if (r === 'unresolved') return { rooms: [...rooms], unresolved: true };
    if (r.room) rooms.add(r.room);
  }
  return { rooms: [...rooms].sort(), unresolved: false };
}

/** First-parent keys referenced by loaded folders but not requested yet (a missing one stays `undefined` in the map). */
export function missingAncestors(folders: Record<string, Folder>): string[] {
  const out = new Set<string>();
  for (const folder of Object.values(folders)) {
    const p = firstParentOf(folder);
    if (p && !(p in folders)) out.add(p);
  }
  return [...out];
}

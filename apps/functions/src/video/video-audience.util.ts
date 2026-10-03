/** Spec 1.82 §8: a chat room album's root folder names its room; descendants inherit it. */
export const MAX_FOLDER_DEPTH = 8;

type Folder = Record<string, unknown> | undefined;

function roomOf(folder: Folder): string {
  // Legacy folder docs lack the field — coalesce, never trust the type.
  return String(folder?.['matrixRoomId'] ?? '');
}

function parentsOf(folder: Folder): string[] {
  const p = folder?.['parents'];
  return Array.isArray(p) ? p.filter((k): k is string => typeof k === 'string' && k.length > 0) : [];
}

/** The room audience of a document in these folders: the nearest `matrixRoomId` up the first-parent chain. */
export function audienceRoomOf(folderKeys: string[], folders: Record<string, Folder>): string {
  for (const start of folderKeys) {
    const seen = new Set<string>();
    let key: string | undefined = start;
    for (let depth = 0; key && depth <= MAX_FOLDER_DEPTH && !seen.has(key); depth++) {
      seen.add(key);
      const folder: Folder = folders[key];
      if (!folder) break;
      const room = roomOf(folder);
      if (room) return room;
      key = parentsOf(folder)[0];
    }
  }
  return '';
}

/** Parent keys referenced by loaded folders but not loaded yet. */
export function missingAncestors(folders: Record<string, Folder>): string[] {
  const out = new Set<string>();
  for (const folder of Object.values(folders)) for (const p of parentsOf(folder)) if (!(p in folders)) out.add(p);
  return [...out];
}

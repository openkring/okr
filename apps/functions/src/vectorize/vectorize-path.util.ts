export interface DocumentRendering {
  format: string;
  fullPath: string;
  mimeType: string;
  size: number;
  generator: string;
}

/**
 * Storage path of a rendering: a sibling of its source in a `renderings/` subdirectory, named by
 * document key. Keying on docKey (not baseName) avoids colliding with an independently uploaded
 * `logo.svg` in the same directory and with two documents sharing a base name. The path stays under
 * the same tenant prefix as the source, so the existing storage.rules tenant scoping applies.
 * Mirrors `renderingPath()` in libs/content/document/util — the CF bundle can not import from libs/document.
 */
export function renderingPath(sourceFullPath: string, docKey: string, format: string): string {
  const slash = sourceFullPath.lastIndexOf('/');
  const dir = slash < 0 ? '' : sourceFullPath.slice(0, slash);
  return `${dir ? dir + '/' : ''}renderings/${docKey}.${format}`;
}

/**
 * Upsert a rendering into a renderings list: replaces the entry of the same format in place,
 * appends a new format, preserves unrelated formats. `format` is the primary key of the array.
 * Tolerates `undefined` — legacy documents have no `renderings` field at all.
 */
export function upsertRendering(
  renderings: DocumentRendering[] | undefined,
  rendering: DocumentRendering,
): DocumentRendering[] {
  const list = renderings ?? [];
  const idx = list.findIndex(r => r.format === rendering.format);
  if (idx < 0) return [...list, rendering];
  return list.map((r, i) => (i === idx ? rendering : r));
}

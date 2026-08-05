import { DocumentModel, DocumentRendering } from '@okr/shared-models';

/**
 * Storage path of a rendering: a sibling of its source in a `renderings/` subdirectory, named by
 * document key. Keying on docKey (not baseName) avoids colliding with an independently uploaded
 * `logo.svg` in the same directory and with two documents sharing a base name.
 * Kept in sync with `renderingPath()` in apps/functions/src/vectorize/vectorize-path.util.ts —
 * the CF bundle can not import from libs/document.
 */
export function renderingPath(sourceFullPath: string, docKey: string, format: string): string {
  const slash = sourceFullPath.lastIndexOf('/');
  const dir = slash < 0 ? '' : sourceFullPath.slice(0, slash);
  return `${dir ? dir + '/' : ''}renderings/${docKey}.${format}`;
}

/**
 * Resolve the storage path of a requested rendering, falling back to the original.
 * This is the single place that knows the fallback rule.
 * @param doc the document
 * @param format the requested format ('' = the original)
 * @returns the fullPath of the rendering, or doc.fullPath when it does not exist
 */
export function resolveRendering(doc: DocumentModel, format: string): string {
  if (!format) return doc.fullPath;
  // legacy documents have no `renderings` field at all — Firestore reads skip model defaults
  const rendering = (doc.renderings ?? []).find(r => r.format === format);
  return rendering?.fullPath ?? doc.fullPath;
}

/**
 * Upsert a rendering into a renderings list: replaces the entry of the same format in place,
 * appends a new format, preserves unrelated formats. `format` is the primary key of the array.
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

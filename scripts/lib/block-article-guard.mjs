/**
 * Guard for scripts that write the old fields of an article (`content`, `properties.images`, `imageStyle`, `cta`,
 * `contentI18n` …). An article with blocks (spec 1.173) is drawn from `properties.blocks` only: a change of its old fields
 * is not seen by anybody, and replacing the document deletes what was written in the editor. So such a script stops
 * before its first write (spec 1.175 §12). The messages name the section keys, never any content.
 */

/** Whether the document is an article with blocks; same rule as `articleBlocksOf` in shared-models. A missing document has none. */
export function hasBlocks(data) {
  return (!data?.type || data.type === 'article') && Array.isArray(data?.properties?.blocks);
}

/** Throws when `sections/<key>` with this data is an article with blocks. `data` undefined = there is no such document. */
export function assertNoBlocks(key, data) {
  if (hasBlocks(data)) throw blockArticleError([key]);
}

/** Reads the sections and throws when one of them is an article with blocks. To be called before the first write. */
export async function assertNoBlocksIn(db, keys) {
  const unique = [...new Set(keys)];
  if (unique.length === 0) return;
  const snaps = await db.getAll(...unique.map((key) => db.doc(`sections/${key}`)));
  const blocked = unique.filter((_, i) => hasBlocks(snaps[i].data()));
  if (blocked.length > 0) throw blockArticleError(blocked);
}

function blockArticleError(keys) {
  return new Error(`${keys.map((key) => `sections/${key}`).join(', ')}: article with blocks — this script writes the old fields, edit the article in the app. Stopped.`);
}

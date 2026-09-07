import { DEFAULT_NAME, DEFAULT_NOTES } from '@okr/shared-constants';
import { FolderModel } from '@okr/shared-models';
import { addIndexElement, sanitizeFileName } from '@okr/shared-util-core';

/*-------------------------- factory --------------------------------*/
/**
 * Create a new FolderModel populated with the given values.
 * @param tenantId the tenant the folder belongs to
 * @param name the display name of the folder
 * @param parentKeys optional list of parent FolderModel okeys for hierarchy nesting
 * @param ownerKey personKey of the creating user — owner may edit/delete the folder
 */
export function newFolderModel(tenantId: string, name = DEFAULT_NAME, parentKeys: string[] = [], ownerKey = ''): FolderModel {
  const folder = new FolderModel(tenantId);
  folder.name = name;
  folder.title = name;
  folder.description = DEFAULT_NOTES;
  folder.parents = parentKeys;
  folder.ownerKey = ownerKey;
  return folder;
}

/*-------------------------- i18n title --------------------------------*/
/**
 * Return the translation key for a folder operation label.
 * @param operation e.g. 'create', 'update', 'delete'
 */
export function getFolderTitle(operation: string): string {
  return `folder.operation.${operation}.label`;
}

/*-------------------------- search index --------------------------------*/
/**
 * Build the search index string for a FolderModel.
 * @param folder the folder to index
 */
export function getFolderIndex(folder: FolderModel): string {
  let index = '';
  index = addIndexElement(index, 'n', folder.name);
  index = addIndexElement(index, 'd', folder.description);
  return index;
}

/**
 * Returns a human-readable description of the index structure.
 */
export function getFolderIndexInfo(): string {
  return 'n:ame d:escription';
}

/* ---------------------- Publication (public galleries) -------------------------*/
/**
 * A folder is served by the public gallery endpoint only when BOTH hold:
 *   1. its document key ends in `-public`, and
 *   2. its `tags` carry `public`.
 *
 * The authority is `isPublicFolder()` in apps/functions/src/publicApi/routes/gallery.ts — the
 * function runs on the Admin SDK and is what actually gates anonymous reads. These helpers exist
 * so the app can SHOW and SET the same state; they never grant anything. The duplication is
 * unavoidable (separate bundles) and must be kept in step with that file.
 *
 * Why two gates and why this split: the key is immutable and appears in `folderKeys` on every
 * document, so publication is readable from the file itself. The tag is mutable, which makes it
 * the revocable half — untagging unpublishes a gallery without moving a single file.
 */
export const PUBLIC_FOLDER_SUFFIX = '-public';
export const PUBLIC_FOLDER_TAG = 'public';

/** Whether the key qualifies. A folder whose key does not can NEVER be published — keys are immutable. */
export function isPublicFolderKey(folderKey: string): boolean {
  return folderKey.endsWith(PUBLIC_FOLDER_SUFFIX);
}

/** The tags string carries the exact `public` tag (not merely a tag containing that word). */
export function hasPublicFolderTag(tags: string): boolean {
  return splitFolderTags(tags).includes(PUBLIC_FOLDER_TAG);
}

/** Both gates — mirrors the Cloud Function. */
export function isFolderPublished(folder: FolderModel): boolean {
  return isPublicFolderKey(folder.okey ?? '') && hasPublicFolderTag(folder.tags ?? '');
}

/**
 * The document key for a new folder that is to be published: `<tenantId>_<slug><suffix>`.
 * Only PUBLISHED folders get a derived key; everything else keeps the random key createModel()
 * generates. Deriving keys for all folders would turn every same-named folder into a silent
 * overwrite (createModel uses setDoc), which is not a trade worth making for cosmetics.
 */
export function derivePublicFolderKey(tenantId: string, name: string): string {
  const slug = sanitizeFileName(name).toLowerCase();
  return `${tenantId}_${slug}${PUBLIC_FOLDER_SUFFIX}`;
}

/** Add or remove the `public` tag, leaving every other tag untouched and the order stable. */
export function setFolderPublicTag(tags: string, isPublic: boolean): string {
  const rest = splitFolderTags(tags).filter((tag) => tag !== PUBLIC_FOLDER_TAG);
  return (isPublic ? [...rest, PUBLIC_FOLDER_TAG] : rest).join(',');
}

function splitFolderTags(tags: string): string[] {
  return (tags ?? '').split(',').map((tag) => tag.trim()).filter(Boolean);
}

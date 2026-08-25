import { CommentModel } from "@okr/shared-models";
import { DateFormat, generateRandomString, getTodayStr } from "@okr/shared-util-core";

/* ---------------------- Model  -------------------------------*/
 /**
   * Convenience function to create a new CommentModel with given values.
   * @param authorKey personKey of the currentUser (to resolve avatar image)
   * @param authorName 
   * @param commentStr 
   * @param parentKey modelType.key of the parent model
   * @param tenant
  * @param attachmentKeys okeys of the documents attached to this comment
   * @returns the created CommentModel
   */
export function createComment(authorKey: string, authorName: string, commentStr: string, parentKey: string, tenant: string, attachmentKeys: string[] = []): CommentModel {
  const comment = new CommentModel();
  comment.okey = generateRandomString(20);
  comment.authorKey = authorKey;
  comment.authorName = authorName;
  comment.creationDateTime = getTodayStr(DateFormat.StoreDateTime);
  comment.parentKey = parentKey;
  comment.description = commentStr;
  comment.attachmentKeys = attachmentKeys;
  comment.isArchived = false;
  comment.tenants = [tenant];
  comment.index = getCommentIndex(comment);
  return comment;
}

// as long as we don't show list of comments, we don't need an index
export function getCommentIndex(comment: CommentModel): string {
  return `ak:${comment.authorKey}, d:${comment.creationDateTime}, pk:${comment.parentKey}`;
}

export function getCommentIndexInfo(): string {
  return 'ak:authorKey, d:creationDateTime, pk:parentKey';
}

/* ---------------------- Attachments -------------------------------*/
/**
 * File extensions a browser renders as an image. Kept next to the MIME check because a file
 * picked on iOS frequently arrives with an empty `type` — the extension is then the only signal.
 */
const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'svg', 'heic', 'heif'];

/**
 * True when the attachment can be shown as a thumbnail rather than a file chip.
 * @param mimeType the MIME type as reported by the browser or stored on the DocumentModel (may be empty)
 * @param fileName the file name or full path — the fallback when the MIME type is missing
 */
export function isImageMimeType(mimeType?: string, fileName?: string): boolean {
  if (mimeType && mimeType.toLowerCase().startsWith('image/')) return true;
  if (!fileName) return false;
  const dot = fileName.lastIndexOf('.');
  if (dot < 0) return false;
  return IMAGE_EXTENSIONS.includes(fileName.substring(dot + 1).toLowerCase());
}

/** {@link isImageMimeType} for a freshly picked File. */
export function isImageFile(file: File): boolean {
  return isImageMimeType(file.type, file.name);
}

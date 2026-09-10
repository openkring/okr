import { AlbumConfig, DocumentModel, ImageConfig, ImageType } from "@okr/shared-models";
import { hasRendering, resolveRendering } from "@okr/content-document-util";
import { generateRandomString, sanitizeFileName } from "@okr/shared-util-core";
// getBackgroundStyle moved to @okr/shared-util-core so shared-ui's image grid can use it too;
// re-exported here because callers (and their imports) still name it as an album helper.
export { getBackgroundStyle } from "@okr/shared-util-core";

/** Length of the random path segment — short enough to stay out of the way, long enough that
 * two members uploading in the same second do not collide (36^8 ≈ 2.8×10¹²  combinations). */
const UPLOAD_PATH_RANDOM_LENGTH = 8;

/**
 * A storage path for `fileName` under `basePath` that no concurrent upload can already be using.
 *
 * Uniqueness by CONSTRUCTION, not by probing: the previous approach (`uniqueUploadPath` /
 * `pathIsTaken`, now removed) asked Storage "is this path free?" and only added a suffix on a
 * hit. Two members uploading their own `IMG_0042.mov` into the same album folder at the same
 * moment could both get "free" back before either had written anything, both write the SAME
 * path, and the second upload silently overwrites the first one's bytes — after which the
 * transcoder's `where('fullPath','==',…).limit(1)` lookup resolves to an arbitrary one of the
 * two `docs` documents: one clip is never transcoded, the other's tile shows a poster over a
 * different video underneath. A leading random segment makes every path different up front, so
 * there is no window in which two uploads can agree on the same path — no round trip, no race.
 *
 * The sanitized original name stays in the path (readable in the bucket, keeps its extension for
 * `resolveMimeType` and the storage.rules extension gate); the human-readable name shown in the
 * UI comes from `DocumentModel.title`, which the caller sets from the unsanitized original file
 * name — see `AlbumStore.addFiles`.
 * @param basePath the folder the file is uploaded into (no trailing slash)
 * @param originalFileName the file's original (unsanitized) name
 * @returns `${basePath}/<random>-<sanitized fileName>`
 */
export function buildAlbumUploadPath(basePath: string, originalFileName: string): string {
  return `${basePath}/${generateRandomString(UPLOAD_PATH_RANDOM_LENGTH)}-${sanitizeFileName(originalFileName)}`;
}

/**
 * Map a DocumentModel to the ImageConfig the album renders.
 * fullPath is the storage path — the imgix pipes/overlays expect exactly that.
 */
export function toImageConfig(doc: DocumentModel): ImageConfig {
  const fileName = doc.fullPath.split('/').pop() ?? doc.fullPath;
  const type = getDocumentImageType(doc.mimeType);
  const isVideo = type === ImageType.Video;
  // Ein Video wird als sein Poster-Frame dargestellt: das Original ist für imgix nur ein
  // Byte-Strom (Spec §7.1), das jpg-Rendering dagegen ein gewöhnliches Bild. Fehlt es noch,
  // liefert resolveRendering den Originalpfad und `pending` trägt den Wartezustand.
  return {
    label: doc.title || fileName,
    type,
    url: isVideo ? resolveRendering(doc, 'jpg') : doc.fullPath,
    actionUrl: doc.url,
    altText: doc.altText || doc.title || fileName,
    overlay: '',
    documentKey: doc.okey,
    credit: doc.credit,
    ...(isVideo && !hasRendering(doc, 'mp4') ? { pending: true } : {})
  };
}

export function getDocumentImageType(mimeType: string): ImageType {
  if (mimeType.startsWith('image/')) return ImageType.Image;
  if (mimeType.startsWith('video/')) return ImageType.Video;
  if (mimeType.startsWith('audio/')) return ImageType.Audio;
  if (mimeType === 'application/pdf') return ImageType.Pdf;
  return ImageType.Doc;
}

/** Whether a document is shown in an album with the given config. Images are always shown. */
export function isVisibleInAlbum(doc: DocumentModel, config: AlbumConfig): boolean {
  switch (getDocumentImageType(doc.mimeType)) {
    case ImageType.Image: return true;
    case ImageType.Pdf: return config.showPdfs;
    case ImageType.Video: return config.showVideos;
    case ImageType.StreamingVideo: return config.showStreamingVideos;
    case ImageType.Doc: return config.showDocs;
    default: return false;
  }
}

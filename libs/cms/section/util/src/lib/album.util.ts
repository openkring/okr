import { AlbumConfig, DocumentModel, ImageConfig, ImageType } from "@okr/shared-models";
// getBackgroundStyle moved to @okr/shared-util-core so shared-ui's image grid can use it too;
// re-exported here because callers (and their imports) still name it as an album helper.
export { getBackgroundStyle } from "@okr/shared-util-core";

/**
 * Map a DocumentModel to the ImageConfig the album renders.
 * fullPath is the storage path — the imgix pipes/overlays expect exactly that.
 */
export function toImageConfig(doc: DocumentModel): ImageConfig {
  const fileName = doc.fullPath.split('/').pop() ?? doc.fullPath;
  return {
    label: doc.title || fileName,
    type: getDocumentImageType(doc.mimeType),
    url: doc.fullPath,
    actionUrl: doc.url,
    altText: doc.altText || doc.title || fileName,
    overlay: '',
    documentKey: doc.okey,
    credit: doc.credit
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

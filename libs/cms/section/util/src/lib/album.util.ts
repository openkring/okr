import { AlbumConfig, BackgroundStyle, DocumentModel, ImageConfig, ImageStyle, ImageType } from "@okr/shared-models";
import { buildOverlayParams, die, getSizedImgixParamsByExtension } from "@okr/shared-util-core";

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

export function getBackgroundStyle(imgixBaseUrl: string, imageStyle: ImageStyle, url: string, image?: ImageConfig): BackgroundStyle {
  if (!imageStyle.width || !imageStyle.height) die('album.util.getBackgroundStyle: image width and height must be set');
  const sizeParams = getSizedImgixParamsByExtension(url, imageStyle.width, imageStyle.height);
  const overlayParams = image ? buildOverlayParams(image, imageStyle) : '';
  const params = overlayParams ? sizeParams + '&' + overlayParams : sizeParams;
  const fullUrl = `${imgixBaseUrl}/${url}?${params}`;
  return {
    'background-image': `url(${fullUrl})`,
    'min-height': '200px',
    'background-size': 'cover',
    'background-position': 'center',
    'border': '1px'
  };
}

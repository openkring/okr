/*
   utility functions to handle images.
   we use imgix for image handling.
   one single image in high resolution is uploaded to firebase storage.
   Firebase storage is linked as a source to imgix CDN and the images can be served from there.
*/
import { THUMBNAIL_SIZE } from "@okr/shared-constants";
import { ImageConfig, ImageStyle, ImageType } from "@okr/shared-models";
import { fileExtension, fileLogo, isAudio, isDocument, isImage, isPdf, isStreamingVideo, isVideo } from './file.util';
import { die, warn } from './log.util';


export function getImageType(fileName: string): ImageType {
  if (isImage(fileName)) return ImageType.Image;
  // we ignore the streaming video files *.ts as they are listed with the m3u8 file (as StreamingVideo)
  if (isVideo(fileName) && !fileName.endsWith('.ts')) return ImageType.Video;
  if (isStreamingVideo(fileName)) return ImageType.StreamingVideo;
  if (isAudio(fileName)) return ImageType.Audio;
  if (isPdf(fileName)) return ImageType.Pdf;
  if (isDocument(fileName)) return ImageType.Doc;
  return ImageType.Other;
}

/**
 * This method constructs a valid relative imgix url based on a given absolute or relative path.
 * If no path is given, an empty string will be returned.
 * If the path is absolute (probably already an imgix url), it will be returned as is.
 * Params are attached as query parameters if urlType === 'storage'.
 * Beware: the default params work with images only. Parameters for other file types (e.g. pdf) need to be added explicitely.
 * Beware: this only works with urlTypes http/https/assets/storage, but not with urlType=key.
 * @param path a mandatory absolute or relative path to an image
 * @param params the imgix query parameters (optional)
 * @returns a valid imgix url or AVATAR_URL if no path was given.
 */
export function getImgixUrl(path: string | undefined, params = 'auto=compress,enhance'): string {
  if (!path || path.length === 0) return '';
  const _path = fixHttpUrl(path) ?? die('img.util.getImgixUrl -> path is undefined'); // http -> https
  const _urlType = checkUrlType(_path);
  switch (_urlType) {
    case 'imgix':
    case 'https': return _path;
    // A literal space in the path breaks srcset parsing (the browser splits candidates on
    // whitespace), so the image silently fails to load even though the URL works in src.
    case 'assets': return encodeURI(_path);
    case 'storage': return encodeURI(_path) + '?' + params;
    // A 'key' (or anything unrecognised) is not renderable here. This runs inside template
    // computeds, so throwing would tear down the whole view for one bad url -> warn + empty.
    default:
      warn('img.util.getImgixUrl -> invalid url type: ' + _urlType + ' (path: ' + _path + ')');
      return '';
  }
}

export function getImgixUrlWithAutoParams(path: string, imgixParams?: string): string {
  const params = imgixParams ?? getImgixParamsByExtension(path);
  return getImgixUrl(path, params);
}

export type UrlType = 'https' | 'http' | 'assets' | 'storage' | 'imgix' | 'key';

// imgix: an absolute, external imgix URL
// https: an absolute, external https URL
// http:  an insecure absolute http URL
// assets: a relative path to an asset in the assets folder
// storage: a relative path to a file in the storage
// a key (this will be converted into tenant/slug/key/DOCUMENT_DIR in document.util)
export function checkUrlType(url: string | undefined): UrlType | undefined {
  if (!url || url.length === 0) {
    warn('img.util.checkUrlType -> url is undefined');
    return undefined;
  }
  // Require the path separator so a look-alike host (e.g. https://bkaiser.imgix.net.evil.com)
  // is not misclassified as an imgix URL (CodeQL js/incomplete-url-substring-sanitization).
  if (url.startsWith('https://bkaiser.imgix.net/')) {
    return 'imgix';
  } else if (url.startsWith('https://')) {
    return 'https';
  } else if (url.startsWith('http://')) {
    return 'http';
  } else if (url.startsWith('assets/')) {
    return 'assets';
  } else if (url.startsWith('tenant')) {
    return 'storage';
  } else {
    return 'key';
  }
}

/**
 * Checks whether a url is using http protocol. If so, it prints a warning and replaces http with https.
 * @param url the source url
 * @returns the fixed url
 */
export function fixHttpUrl(url: string | undefined): string | undefined {
  if (!url || url.length === 0) return undefined;
  if (url.startsWith('http://')) {
    warn('path is an insecure absolute URL. This is not allowed; protocol is replaced with https.');
    url = 'https://' + url.substring(7);
  }
  return url;
}

/**
 * Creates the thumbnail url for any file type.
 * If the file is an image or pdf, the thumbnail is created using imgix.
 * If the file is neither an image nor a pdf, the url to its file type icon is returned. 
 * @param path 
 * @param width 
 * @param height 
 * @returns 
 */
export function getThumbnailUrl(path: string, width: string, height: string): string {
  const params = getSizedImgixParamsByExtension(path, width, height);
  if (params.length === 0) {   // neither image nor pdf -> return path to file icon
    const extension = fileExtension(path);
    return fileLogo(extension);
  } else {
    return getImgixUrl(path, params);
  }
}

/**
 * Returns the imgix parameters for an image or pdf file with a given width and height.
 * @param pathOrExtension the path or extension of a file
 * @param width the width of the image
 * @param height the height of the image
 * @returns the imgix parameters for images and pdfs, or an empty string for other file types
 */
export function getSizedImgixParamsByExtension(pathOrExtension: string | undefined, width: string, height: string): string {
  if (!pathOrExtension || pathOrExtension.length === 0) return '';
  const arParams = `ar=${width}:${height}`;
  const params = getImgixParamsByExtension(pathOrExtension);
  if (isPdf(pathOrExtension)) {
    return params + '&' + arParams;
  }
  if (isImage(pathOrExtension)) {
    return arParams + '&' + params;
  }
  return '';
}

/**
 * Builds the imgix text-overlay parameters rendered at the bottom of an image.
 *
 * Composition rule:
 * - if `image.overlay` (free-form) is set, it wins verbatim (manual override);
 * - otherwise the overlay is composed from the image's title (`label`) when
 *   `style.showTitle` is true and its attribution (`credit`) when `style.showSource`
 *   is true. Lines are joined with a newline; title first, source second.
 *
 * Returns an empty string when there is nothing to render (so callers can append
 * it unconditionally, e.g. `params + (overlay ? '&' + overlay : '')`).
 *
 * @param image the image configuration (label, credit, overlay)
 * @param style the image style (showTitle, showSource toggles)
 * @returns imgix `txt*` params (without a leading separator), or '' when empty
 */
export function buildOverlayParams(image: ImageConfig, style: ImageStyle): string {
  const text = buildOverlayText(image, style);
  if (text.length === 0) return '';
  // bottom-left aligned white text with a shadow for readability over any background.
  const encoded = encodeURIComponent(text);
  return `txt=${encoded}&txt-align=bottom,left&txt-color=ffffff&txt-size=14&txt-pad=15&txt-shad=6`;
}

/**
 * Builds the caption text shown over an image (title and/or attribution).
 *
 * Composition rule:
 * - if `image.overlay` (free-form) is set, it wins verbatim (manual override);
 * - otherwise the caption is composed from the image's title (`label`) when
 *   `style.showTitle` is true and its attribution (`credit`) when `style.showSource`
 *   is true. Lines are joined with a newline; title first, source second.
 *
 * Returns an empty string when there is nothing to render, so callers can skip the
 * caption element entirely. Renderers that draw the caption as DOM (okr-img, the
 * slider/zoom modals) use this directly; renderers that cannot overlay DOM (the album's
 * CSS `background-image`) bake the same text into the imgix url via
 * {@link buildOverlayParams}.
 *
 * @param image the image configuration (label, credit, overlay)
 * @param style the image style (showTitle, showSource toggles)
 * @returns the caption text (possibly multi-line), or '' when there is nothing to show
 */
export function buildOverlayText(image: ImageConfig, style: ImageStyle): string {
  const manual = image.overlay?.trim() ?? '';
  if (manual.length > 0) return manual;
  const lines: string[] = [];
  if (style.showTitle && image.label?.trim()) lines.push(image.label.trim());
  if (style.showSource && image.credit?.trim()) lines.push(image.credit.trim());
  return lines.join('\n');
}

/**
 * The subset of an imgix `fm=json` response that can carry an attribution.
 *
 * Note that the dedicated *credit line* is an IPTC field, not an EXIF one: EXIF defines
 * only `Artist` (0x013B) and `Copyright` (0x8298), and both are TIFF tags — which is why
 * imgix reports them under `TIFF` rather than `Exif`. imgix also normalises the IPTC field
 * names, e.g. IIM `By-line` is returned as `Byline` and may hold several creators.
 */
export interface ImageCreditMetaData {
  IPTC?: {
    Credit?: string;             // IIM 2:110 — the credit/provider line, e.g. "Keystone"
    Byline?: string | string[];  // IIM 2:80  — the creator(s) of the image
    CopyrightNotice?: string;    // IIM 2:116
    Copyright?: string;          // as reported by imgix for some files
    Source?: string;             // IIM 2:115 — the original owner of the rights
  };
  TIFF?: {
    Artist?: string;             // EXIF/TIFF 0x013B
    Copyright?: string;          // EXIF/TIFF 0x8298
  };
}

/** the length ImageConfig.credit is capped at in the editors; some copyright notices are essays */
const MAX_CREDIT_LENGTH = 150;

/**
 * Extracts an attribution string from the IPTC/EXIF metadata of an imgix `fm=json` response.
 *
 * Which key holds the attribution varies by how the file was produced, and no single key is
 * dependable — imgix's own sample images never populate `IPTC.Credit` at all. So this walks a
 * priority list and takes the first non-empty value rather than betting on one field:
 * the explicit credit line, then the creator, then the copyright/source fallbacks, then the
 * EXIF/TIFF equivalents. Multiple `Byline` creators are joined.
 *
 * Most photos carry nothing at all (phone cameras write no attribution), so an empty result is
 * the normal case and must never be treated as a failure.
 *
 * @param data the parsed imgix `fm=json` response, or undefined
 * @returns the attribution, trimmed and capped at 150 chars, or '' when the file carries none
 */
export function extractCredit(data: ImageCreditMetaData | undefined): string {
  if (!data) return '';
  const iptc = data.IPTC;
  const tiff = data.TIFF;
  const byline = Array.isArray(iptc?.Byline) ? iptc?.Byline.join(', ') : iptc?.Byline;
  const candidates = [
    iptc?.Credit,
    byline,
    iptc?.CopyrightNotice,
    iptc?.Copyright,
    iptc?.Source,
    tiff?.Artist,
    tiff?.Copyright
  ];
  for (const candidate of candidates) {
    const value = typeof candidate === 'string' ? candidate.trim() : '';
    if (value.length > 0) return value.slice(0, MAX_CREDIT_LENGTH);
  }
  return '';
}

/**
 * Returns the default imgix parameters for an image or pdf file.
 * @param pathOrExtension the path or extension of a file
 * @returns the imgix parameters for images and pdfs, or an empty string for other file types
 */
export function getImgixParamsByExtension(pathOrExtension: string): string {
  if (isPdf(pathOrExtension)) {
    return 'page=1';
  }
  if (isImage(pathOrExtension)) {
    return 'auto=format,compress,enhance&fit=crop';
  }
  return '';
}

/**
* Adds imgix parameter to the given path.
* The parameters are different for images and pdfs.
* For Images, face recognition is the default (to be used in person avatars)
* This functionality is using imgix.
*/
export function addImgixParams(path: string, size: number, withFaceReco = true): string {
  let params = '';
  if (isPdf(path)) {
    params = 'page=1&ar=1:1';
  }
  if (isImage(path)) {
    if (withFaceReco) {
      params = 'w=' + size + '&h=' + size + '&fit=crop&crop=faces';
      // older implementations: 
      // 
      // '&fit=clamp&auto=compress,enhance'
      // '&fit=facearea&faceindex=2&facepad=1.5&mask=ellipse'
    } else {
      params = 'auto=format,compress,enhance&ar=1:1&fit=clamp'
    }
  }
  return getImgixUrl(path, params);
}

export const IMGIX_PDF_PARAMS = 'page=1';
export const IMGIX_JPG_PARAMS = 'fm=jpg&auto=format,compress,enhance&fit=crop';
export const IMGIX_THUMBNAIL_PARAMS = `fm=jpg&width=${THUMBNAIL_SIZE}&height=${THUMBNAIL_SIZE}&auto=format,compress,enhance&fit=crop`;
export const IMGIX_JSON_PARAMS = 'fm=json';

export function getImgixJpgUrl(url: string, imgixBaseUrl: string): string {
  if (url.startsWith(imgixBaseUrl)) return `${url}?${IMGIX_THUMBNAIL_PARAMS}`;
  return `${imgixBaseUrl}/${url}?${IMGIX_JPG_PARAMS}`;
}

export function getImgixPdfUrl(url: string, imgixBaseUrl: string): string {
  if (url.startsWith(imgixBaseUrl)) return `${url}?${IMGIX_THUMBNAIL_PARAMS}`;
  return `${imgixBaseUrl}/${url}?${IMGIX_PDF_PARAMS}`;
}

export function getImgixThumbnailUrl(url: string, imgixBaseUrl: string): string {
  if (url.startsWith(imgixBaseUrl)) return `${url}?${IMGIX_THUMBNAIL_PARAMS}`;
  return `${imgixBaseUrl}/${url}?${IMGIX_THUMBNAIL_PARAMS}`;
}

export function getImgixJsonUrl(url: string, imgixBaseUrl: string): string {
  if (url.startsWith(imgixBaseUrl)) return `${url}?${IMGIX_THUMBNAIL_PARAMS}`;
  return `${imgixBaseUrl}/${url}?${IMGIX_JSON_PARAMS}`;
}
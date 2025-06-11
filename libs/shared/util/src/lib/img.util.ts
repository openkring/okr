/*
   utility functions to handle images.
   we use imgix for image handling.
   one single image in high resolution is uploaded to firebase storage.
   Firebase storage is linked as a source to imgix CDN and the images can be served from there.
*/
import { ImageType } from "@bk2/shared/models";
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
 * @returns a valid imgix url or DEFAULT_AVATAR_URL if no path was given.
 */
export function getImgixUrl(path: string | undefined, params = 'auto=compress,enhance'): string {
  if (!path || path.length === 0) return '';
  const _path = fixHttpUrl(path) ?? die('img.util.getImgixUrl -> path is undefined'); // http -> https
  const _urlType = checkUrlType(_path);
  switch (_urlType) {
    case 'imgix':
    case 'assets':
    case 'https': return _path;   
    case 'storage': return _path + '?' + params;
    default: die('img.util.getImgixUrl -> invalid url type: ' + _urlType);
  }
}

export function getImgixUrlWithAutoParams(path: string, imgixParams?: string): string {
  const _params = imgixParams ?? getImgixParamsByExtension(path);
  return getImgixUrl(path, _params);
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
  if (url.startsWith('https://bkaiser.imgix.net')) {
    return 'imgix';
  } else if (url.startsWith('https://')) {
    return 'https';
  } else if (url.startsWith('http://')) {
    return 'http';
  } else if (url.startsWith('assets')) {
    return 'assets';
  } else if (url.indexOf('/') > 0) {
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
export function getThumbnailUrl(path: string, width: number, height: number): string {
  const _params = getSizedImgixParamsByExtension(path, width, height);
  if (_params.length === 0) {   // neither image nor pdf -> return path to file icon
    const _extension = fileExtension(path);
    return fileLogo(_extension);
  } else {
    return getImgixUrl(path, _params);
  }
}

/**
 * Returns the imgix parameters for an image or pdf file with a given width and height.
 * @param pathOrExtension the path or extension of a file
 * @param width the width of the image
 * @param height the height of the image
 * @returns the imgix parameters for images and pdfs, or an empty string for other file types
 */
export function getSizedImgixParamsByExtension(pathOrExtension: string | undefined, width: number, height: number): string {
  if (!pathOrExtension || pathOrExtension.length === 0) return '';
  const _arParams = `ar=${width}:${height}`;
  const _params = getImgixParamsByExtension(pathOrExtension);
  if (isPdf(pathOrExtension)) {
    return _params + '&' + _arParams;
  }
  if (isImage(pathOrExtension)) {
    return _arParams + '&' + _params;
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
  let _params = '';
  if (isPdf(path)) {
    _params = 'page=1&ar=1:1';
  }
  if (isImage(path)) {
    if (withFaceReco) {
      _params = 'w=' + size + '&h=' + size + '&fit=crop&crop=faces';
      // older implementations: 
      // 
      // '&fit=clamp&auto=compress,enhance'
      // '&fit=facearea&faceindex=2&facepad=1.5&mask=ellipse'
    } else {
      _params = 'auto=format,compress,enhance&ar=1:1&fit=clamp'
    }
  }
  return getImgixUrl(path, _params);
}

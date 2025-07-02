import { inject, Pipe, PipeTransform } from '@angular/core';

import { ENV } from '@bk2/shared/config';
import { THUMBNAIL_SIZE } from '@bk2/shared/constants';
import { Image } from '@bk2/shared/models';
import { die, getImgixUrl, getSizedImgixParamsByExtension, getThumbnailUrl } from '@bk2/shared/util-core';

@Pipe({
  name: 'imgixUrl',
})
export class ImgixUrlPipe implements PipeTransform {
  transform(image: Image, baseUrl?: string): string {
    const _baseUrl = baseUrl ? baseUrl + '/' : '';
    if (image.isThumbnail === true) {
      return getThumbnailUrl(_baseUrl + image.url, THUMBNAIL_SIZE, THUMBNAIL_SIZE);
    }
    return _baseUrl + getImgixUrlFromImage(image);
  }
}

export const IMGIX_PDF_PARAMS = 'page=1';
export const IMGIX_JPG_PARAMS = 'fm=jpg&auto=format,compress,enhance&fit=crop';
export const IMGIX_THUMBNAIL_PARAMS = `fm=jpg&width=${THUMBNAIL_SIZE}&height=${THUMBNAIL_SIZE}&auto=format,compress,enhance&fit=crop`;
export const IMGIX_JSON_PARAMS = 'fm=json';


@Pipe({
  name: 'jpgUrl',
})
export class JpgUrlPipe implements PipeTransform {
  private readonly env = inject(ENV);

  transform(url: string): string {
    return getImgixJpgUrl(url, this.env.services.imgixBaseUrl);
  }
}

@Pipe({
  name: 'pdfUrl',
})
export class PdfUrlPipe implements PipeTransform {
  private readonly env = inject(ENV);
  transform(url: string): string {
    return getImgixPdfUrl(url, this.env.services.imgixBaseUrl);
  }
}

@Pipe({
  name: 'thumbnailUrl',
})
export class ThumbnailUrlPipe implements PipeTransform {
  private readonly env = inject(ENV);
  transform(url: string): string {
    return getImgixThumbnailUrl(url, this.env.services.imgixBaseUrl);
  }
}

export function getImgixUrlFromImage(image: Image): string {
  if (!image.width || !image.height) die('ImgixUrlPipe: image width and height must be set');
  const _params = getSizedImgixParamsByExtension(image.url ?? '', image.width, image.height);
  return getImgixUrl(image.url, _params);
}


export function getImgixJpgUrl(url: string, imgixBaseUrl: string): string {
  return `${imgixBaseUrl}/${url}?${IMGIX_JPG_PARAMS}`;
}

export function getImgixPdfUrl(url: string, imgixBaseUrl: string): string {
  return `${imgixBaseUrl}/${url}?${IMGIX_PDF_PARAMS}`;
}

export function getImgixThumbnailUrl(url: string, imgixBaseUrl: string): string {
  return `${imgixBaseUrl}/${url}?${IMGIX_THUMBNAIL_PARAMS}`;
}

export function getImgixJsonUrl(url: string, imgixBaseUrl: string): string {
  return `${imgixBaseUrl}/${url}?${IMGIX_JSON_PARAMS}`;
}
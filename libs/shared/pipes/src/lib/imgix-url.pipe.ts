import { Pipe, PipeTransform } from '@angular/core';
import { Image } from '@bk2/shared/models';
import { die, getImgixUrl, getSizedImgixParamsByExtension, getThumbnailUrl } from '@bk2/shared/util';

@Pipe({
  name: 'imgixUrl',
})
export class ImgixUrlPipe implements PipeTransform {
  transform(image: Image, baseUrl?: string): string {
    const _baseUrl = baseUrl ? baseUrl + '/' : '';
    if (image.isThumbnail === true) {
      return getThumbnailUrl(_baseUrl + image.url, 200, 200);
    }
    return _baseUrl + getImgixUrlFromImage(image);
  }
}

export function getImgixUrlFromImage(image: Image): string {
  if (!image.width || !image.height) die('ImgixUrlPipe: image width and height must be set');
  const _params = getSizedImgixParamsByExtension(image.url ?? '', image.width, image.height);
  return getImgixUrl(image.url, _params);
}

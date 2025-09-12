import { inject, Pipe, PipeTransform } from '@angular/core';

import { ENV } from '@bk2/shared-config';
import { THUMBNAIL_SIZE } from '@bk2/shared-constants';
import { Image } from '@bk2/shared-models';
import { getImgixJpgUrl, getImgixPdfUrl, getImgixThumbnailUrl, getImgixUrlFromImage, getThumbnailUrl } from '@bk2/shared-util-core';

@Pipe({
  name: 'imgixUrl',
  standalone: true
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

@Pipe({
  name: 'jpgUrl',
  standalone: true
})
export class JpgUrlPipe implements PipeTransform {
  private readonly env = inject(ENV);

  transform(url: string): string {
    return getImgixJpgUrl(url, this.env.services.imgixBaseUrl);
  }
}

@Pipe({
  name: 'pdfUrl',
  standalone: true
})
export class PdfUrlPipe implements PipeTransform {
  private readonly env = inject(ENV);
  transform(url: string): string {
    return getImgixPdfUrl(url, this.env.services.imgixBaseUrl);
  }
}

@Pipe({
  name: 'thumbnailUrl',
  standalone: true
})
export class ThumbnailUrlPipe implements PipeTransform {
  private readonly env = inject(ENV);
  transform(url: string): string {
    return getImgixThumbnailUrl(url, this.env.services.imgixBaseUrl);
  }
}


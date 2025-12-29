import { inject, Pipe, PipeTransform } from '@angular/core';

import { ENV } from '@bk2/shared-config';
import { getImgixJpgUrl, getImgixPdfUrl, getImgixThumbnailUrl } from '@bk2/shared-util-core';

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


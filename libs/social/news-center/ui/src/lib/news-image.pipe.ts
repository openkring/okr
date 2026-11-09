import { Pipe, PipeTransform } from '@angular/core';

import { bypassServiceWorker } from '@okr/social-news-center-util';

/**
 * `{{ url | newsImage }}` — routes an external feed image past the Angular service worker,
 * whose `connect-src` would otherwise refuse it (see `bypassServiceWorker`).
 */
@Pipe({ name: 'newsImage', standalone: true })
export class NewsImagePipe implements PipeTransform {
  public transform(url: string | null | undefined): string {
    return bypassServiceWorker(url);
  }
}

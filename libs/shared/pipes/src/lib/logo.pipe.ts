import { Pipe, PipeTransform, inject } from '@angular/core';
import { ENV } from '@bk2/shared/config';
import { getThumbnailUrl } from '@bk2/shared/util';

@Pipe({
  name: 'logo',
})
export class LogoPipe implements PipeTransform {
  private readonly env = inject(ENV);

  transform(url: string): string {
    return getThumbnailUrl(url, this.env.thumbnail.width, this.env.thumbnail.height);
  }
}

import { Pipe, PipeTransform } from '@angular/core';
import { LOGO_HEIGHT, LOGO_WIDTH } from '@bk2/shared/constants';
import { getThumbnailUrl } from '@bk2/shared/util-core';

@Pipe({
  name: 'logo',
})
export class LogoPipe implements PipeTransform {
  
  transform(url: string): string {
    return getThumbnailUrl(url, LOGO_WIDTH, LOGO_HEIGHT);
  }
}

import { Pipe, PipeTransform } from '@angular/core';
import { LOGO_HEIGHT, LOGO_WIDTH } from '@bk2/shared/config';
import { getThumbnailUrl } from '@bk2/shared/util';

@Pipe({
  name: 'logo',
})
export class LogoPipe implements PipeTransform {
  
  transform(url: string): string {
    return getThumbnailUrl(url, LOGO_WIDTH, LOGO_HEIGHT);
  }
}

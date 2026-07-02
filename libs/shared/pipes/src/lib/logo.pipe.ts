import { Pipe, PipeTransform } from '@angular/core';
import { LOGO_HEIGHT, LOGO_WIDTH } from '@okr/shared-constants';
import { getThumbnailUrl } from '@okr/shared-util-core';

@Pipe({
  name: 'logo',
  standalone: true
})
export class LogoPipe implements PipeTransform {
  
  transform(url: string): string {
    return getThumbnailUrl(url, LOGO_WIDTH + '', LOGO_HEIGHT + '');
  }
}

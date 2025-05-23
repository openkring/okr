import { Pipe, PipeTransform } from '@angular/core';
import { getDuration } from '@bk2/shared/util';

@Pipe({
  name: 'duration',
})
export class DurationPipe implements PipeTransform {

  transform(storeDateFrom: string, storeDateTo: string): string {
    let _from = storeDateFrom;

    // the following is needed to handle relLog data (yyyyMMdd:K,A1,P)
    if (storeDateFrom.includes(':')) {
      const _parts = storeDateFrom.split(':');
      if (_parts[0].length >= 4) _from = _parts[0].substring(0, 4);
    }
    return getDuration(_from, storeDateTo);
  }
}
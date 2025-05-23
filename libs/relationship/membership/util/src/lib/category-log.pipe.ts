import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'categoryLog',
})
export class CategoryLogPipe implements PipeTransform {

  // relLog format: yyyyMMdd:K,A1,P   ->   K -> A1 -> P
  transform(relLog: string): string {
    let _categories = relLog;

    if (relLog.includes(':')) {
      const _parts = relLog.split(':');
      const _cats = _parts[1].split(',');
      _categories = _cats.join(' -> ');
    }
    return _categories
  }
}
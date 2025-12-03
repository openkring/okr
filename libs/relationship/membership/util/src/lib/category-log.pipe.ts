import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'categoryLog',
  standalone: true
})
export class CategoryLogPipe implements PipeTransform {

  // relLog format: yyyyMMdd:K,A1,P   ->   K -> A1 -> P
  transform(relLog: string): string {
    let categories = relLog;

    if (relLog.includes(':')) {
      const parts = relLog.split(':');
      const cats = parts[1].split(',');
      categories = cats.join(' -> ');
    }
    return categories
  }
}
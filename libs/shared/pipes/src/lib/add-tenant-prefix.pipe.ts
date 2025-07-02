import { Pipe, PipeTransform } from '@angular/core';
import { replaceSubstring } from '@bk2/shared/util-core';

@Pipe({
  name: 'replace',
})
export class ReplacePipe implements PipeTransform {

  transform(source: string, pattern: string, replacement: string): string {
      return replaceSubstring(source, pattern, replacement);
  }
}
import { Pipe, PipeTransform } from '@angular/core';
import { replaceSubstring } from '@okr/shared-util-core';

@Pipe({
  name: 'replace',
  standalone: true,
})
export class ReplacePipe implements PipeTransform {
  transform(source: string, pattern: string, replacement: string): string {
    return replaceSubstring(source, pattern, replacement);
  }
}

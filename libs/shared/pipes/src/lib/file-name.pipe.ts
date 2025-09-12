import { Pipe, PipeTransform } from '@angular/core';
import { fileName } from '@bk2/shared-util-core';

@Pipe({
  name: 'fileName',
  standalone: true
})
export class FileNamePipe implements PipeTransform {

  transform(fullPath: string): string {
      return fileName(fullPath);
  }
}
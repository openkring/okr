import { Pipe, PipeTransform } from '@angular/core';
import { fileName } from '@okr/shared-util-core';

@Pipe({
  name: 'fileName',
  standalone: true
})
export class FileNamePipe implements PipeTransform {

  transform(fullPath: string): string {
      return fileName(fullPath);
  }
}
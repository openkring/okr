import { Pipe, PipeTransform } from '@angular/core';
import { fileExtension } from '@okr/shared-util-core';

@Pipe({
  name: 'fileExtension',
  standalone: true
})
export class FileExtensionPipe implements PipeTransform {

  transform(fullPath: string): string {
      return fileExtension(fullPath);
  }
}
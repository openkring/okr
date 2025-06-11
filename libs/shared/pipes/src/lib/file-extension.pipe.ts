import { Pipe, PipeTransform } from '@angular/core';
import { fileExtension } from '@bk2/shared/util';

@Pipe({
  name: 'fileExtension',
})
export class FileExtensionPipe implements PipeTransform {

  transform(fullPath: string): string {
      return fileExtension(fullPath);
  }
}
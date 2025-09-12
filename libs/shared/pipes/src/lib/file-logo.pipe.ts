import { Pipe, PipeTransform } from '@angular/core';
import { fileLogo } from '@bk2/shared-util-core';

@Pipe({
  name: 'fileLogo',
  standalone: true
})
export class FileLogoPipe implements PipeTransform {

  transform(fullPath: string): string {
      return fileLogo(fullPath);
  }
}
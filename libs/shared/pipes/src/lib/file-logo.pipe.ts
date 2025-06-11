import { Pipe, PipeTransform } from '@angular/core';
import { fileLogo } from '@bk2/shared/util';

@Pipe({
  name: 'fileLogo',
})
export class FileLogoPipe implements PipeTransform {

  transform(fullPath: string): string {
      return fileLogo(fullPath);
  }
}
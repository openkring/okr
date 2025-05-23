import { Pipe, PipeTransform } from '@angular/core';
import { getLogoByExtension } from '@bk2/shared/util';

@Pipe({
  name: 'fileLogo',
})
export class FileLogoPipe implements PipeTransform {

  transform(extension: string): string {
      return getLogoByExtension(extension);
  }
}
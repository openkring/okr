import { Pipe, PipeTransform } from '@angular/core';
import { fileSizeUnit } from '@bk2/shared/util';

/*
 * Convert bytes into largest possible unit.
 * Takes an precision argument that defaults to 2.
 * Usage:
 *   bytes | fileSize:precision
 * Example:
 *   {{ 1024 |  fileSize}}
 *   formats to: 1 KB
*/
@Pipe({
  name: 'fileSize',
})
export class FileSizePipe implements PipeTransform {

  transform(bytes = 0, precision = 2 ) : string {
    return fileSizeUnit(bytes, precision);
  }
}
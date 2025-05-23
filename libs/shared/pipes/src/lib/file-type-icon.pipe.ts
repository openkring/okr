import { inject, Pipe, PipeTransform } from '@angular/core';
import { ENV } from '@bk2/shared/config';

@Pipe({
  name: 'fileTypeIcon',
})
export class FileTypeIconPipe implements PipeTransform {
  private readonly env = inject(ENV);

  transform(fileTypeIcon: string): string {
    return `${this.env.app.imgixBaseUrl}/logo/filetypes/${fileTypeIcon}.svg`;
  }
}
